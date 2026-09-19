# Lobby — Local App Launcher

Lobby local en blanco y negro que orquesta utilidades (apps) como procesos hijos.
Cada app es un servicio autónomo (spawn/kill vía HTTP local) servido en un panel del navegador.

## Stack

- **Bun** + **Hono**
- Vanilla JS + Tailwind-free CSS (paleta pura `#000 #111 #222 #fff`)
- **Tauri v2** (Rust) para el tray icon nativo de Windows

## Requisitos

- [Bun](https://bun.sh) ≥ 1.3
- Rust ≥ 1.75 + MSVC Build Tools (para compilar el tray)
- (Opcional) `yt-dlp` para el ejemplo de descarga

## Uso

```bash
bun install
bun run lobby        # solo web en http://127.0.0.1:3000
bun run tray         # tray icon nativo (auto-arranca Bun, doble clic para abrir)
```

### Ejecutable de doble clic

El binario Tauri es el ejecutable del tray:

- **Dev**: `src-tauri/target/debug/lobby-tray.exe` — generado con `cargo build --manifest-path src-tauri/Cargo.toml`
- **Release + instalador**: `cargo build --release --manifest-path src-tauri/Cargo.toml` → NSIS `.exe` en `src-tauri/target/release/bundle/nsis/`

Al hacer **doble clic** en `lobby-tray.exe`:

1. Arranca `bun run index.ts` como hijo (el lobby en `127.0.0.1:3000`).
2. Muestra el icono en la bandeja del sistema.
3. Click izquierdo o menú **Abrir Lobby** → muestra la ventana con la UI.
4. Menú **Iniciar/Detener Lobby** controla el proceso Bun.
5. **Salir** mata el hijo y cierra el tray. Cerrar la ventana la oculta (no cierra el tray).

> Requiere `bun` en el PATH. El .exe no embebe Bun; lo lanza como proceso hijo.

## Estructura

```
lobby/
├── apps/                 # cada app = módulo independiente
│   ├── upscale/          #   service.ts + index.ts + ui.html
│   └── yt-downloader/
├── core/
│   ├── registry.ts       # registro declarativo de apps
│   ├── process-manager.ts# spawn / kill / healthcheck / persistencia
│   └── types.ts
├── src-tauri/            # app Tauri (tray icon nativo)
│   ├── src/main.rs       # tray + auto-spawn de Bun
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/            # icon.ico / icon.png
│   └── dist/index.html   # redirect a http://127.0.0.1:3000
├── ui/layout.html        # shell web (sidebar + panel)
├── data/apps-state.json  # estado persistido (qué apps quedaron on)
└── index.ts              # servidor Hono (lobby + proxy)
```

## Agregar una app

1. Creá `apps/<id>/` con `index.ts` (servidor en puerto propio) y `ui.html`.
2. Registrala en `core/registry.ts` (id, nombre, descripción, icono, puerto, comando).
3. La UI de la app llama al lobby vía proxy: `/apps/<id>/api/...` → reenvía al puerto de la app.

## Seguridad

- Escucha solo en `127.0.0.1` (nunca `0.0.0.0`).
- Servido local-only; no autenticación ni bind externo.
