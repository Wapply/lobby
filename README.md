# Lobby — Local App Launcher

Lobby local en blanco y negro que orquesta utilidades (apps) como procesos hijos.
Cada app es un servicio autónomo (spawn/kill vía HTTP local) servido en un panel del navegador.

## Stack

- **Bun** + **Hono**
- Vanilla JS + Tailwind-free CSS (paleta pura `#000 #111 #222 #fff`)
- Sin dependencias de UI extra

## Requisitos

- [Bun](https://bun.sh) ≥ 1.3
- (Opcional) `yt-dlp` para el ejemplo de descarga

## Uso

```bash
bun install
bun run lobby        # o: bun run index.ts
```

Abrir `http://127.0.0.1:3000`.

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
├── ui/layout.html        # shell (sidebar + panel)
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