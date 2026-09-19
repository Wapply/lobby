#![cfg_attr(windows, windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

struct LobbyProcess(Mutex<Option<std::process::Child>>);

fn spawn_bun(root: &std::path::Path) -> Result<std::process::Child, String> {
    let mut cmd = Command::new("bun");
    cmd.args(["run", "index.ts"]).current_dir(root);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.spawn().map_err(|e| format!("could not spawn bun: {e}"))
}

fn kill_child(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    let _ = child.kill();
    let _ = child.wait();
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
    if guard.is_some() && guard.as_mut().unwrap().try_wait().ok().flatten().is_none() {
        // already running
        return Ok(guard.as_ref().unwrap().id());
    }
    let project_root = find_project_root()?;
    let child = spawn_bun(&project_root)?;
    let pid = child.id();
    *guard = Some(child);
    Ok(pid)
}

#[tauri::command]
fn stop_lobby(state: tauri::State<LobbyProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        kill_child(&mut child);
    }
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
        .invoke_handler(tauri::generate_handler![start_lobby, stop_lobby])
        .setup(|app| {
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
                    "quit" => {
                        // kill bun child first, then exit
                        let s = app.state::<LobbyProcess>();
                        let _ = stop_lobby(s);
                        app.exit(0);
                    }
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

    app.run(|_handle, event| {
        if let RunEvent::Exit = event {
            // final cleanup happens via drop
        }
    });
}