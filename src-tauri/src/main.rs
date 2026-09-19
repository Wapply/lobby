#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

struct LobbyProcess(Mutex<Option<u32>>);

fn spawn_bun(root: &std::path::Path) -> Result<u32, String> {
    let child = Command::new("bun")
        .arg("run")
        .arg("index.ts")
        .current_dir(root)
        .spawn()
        .map_err(|e| format!("could not spawn bun: {e}"))?;
    Ok(child.id())
}

fn find_project_root() -> Result<std::path::PathBuf, String> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            candidates.push(p.to_path_buf());
        }
    }
    for base in candidates {
        let mut cur = base.clone();
        for _ in 0..6 {
            if cur.join("index.ts").exists() {
                return Ok(cur);
            }
            if let Some(parent) = cur.parent() {
                cur = parent.to_path_buf();
            } else {
                break;
            }
        }
    }
    Err("index.ts not found (search from cwd and exe)".into())
}

#[tauri::command]
fn start_lobby(state: tauri::State<LobbyProcess>) -> Result<u32, String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(pid) = *guard {
        return Ok(pid);
    }
    let project_root = find_project_root()?;
    let pid = spawn_bun(&project_root)?;
    *guard = Some(pid);
    Ok(pid)
}

#[tauri::command]
fn stop_lobby(state: tauri::State<LobbyProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(pid) = guard.take() {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .spawn();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").arg(pid.to_string()).spawn();
        }
    }
    Ok(())
}

#[tauri::command]
fn open_lobby(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(LobbyProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_lobby, stop_lobby, open_lobby])
        .setup(|app| {
            // Auto-start Bun lobby on launch (double-click -> tray + server)
            {
                let state = app.state::<LobbyProcess>();
                let _ = start_lobby(state);
            }

            let open_i = MenuItem::with_id(app, "open", "Abrir Lobby", true, None::<&str>)?;
            let start_i = MenuItem::with_id(app, "start", "Iniciar Lobby", true, None::<&str>)?;
            let stop_i = MenuItem::with_id(app, "stop", "Detener Lobby", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &start_i, &stop_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("lobby")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Lobby — click para abrir")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "start" => {
                        let s = app.state::<LobbyProcess>();
                        let _ = start_lobby(s);
                    }
                    "stop" => {
                        let s = app.state::<LobbyProcess>();
                        let _ = stop_lobby(s);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Hide window on close -> keep tray alive
            if let Some(w) = app.get_webview_window("main") {
                let w2 = w.clone();
                w.on_window_event(move |ev| {
                    if let WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                });
            }

            Ok(())
        });

    let app = builder.build(tauri::generate_context!()).expect("tauri build failed");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            // Stop Bun child on exit
            if let Some(state) = handle.try_state::<LobbyProcess>() {
                let _ = stop_lobby(state);
            }
            api.prevent_exit();
            handle.exit(0);
        }
    });
}