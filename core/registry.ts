import type { AppDefinition } from "./types";

/**
 * Declarative registry of apps. Drop a new entry here (or add plugin support
 * later) and the lobby picks it up automatically.
 *
 * All services bind to 127.0.0.1 for local-only access.
 */
export const APPS: AppDefinition[] = [
  {
    id: "yt-downloader",
    name: "YT Downloader",
    description: "Descarga audio/video con yt-dlp.",
    icon: "download",
    port: 3011,
    command: ["bun", "run", "index.ts"],
    ui: "apps/yt-downloader/ui.html",
    favorite: true,
  },
  {
    id: "upscale",
    name: "Upscale",
    description: "Escalado de imágenes con Real-ESRGAN.",
    icon: "zoom-in",
    port: 3012,
    command: ["bun", "run", "index.ts"],
    ui: "apps/upscale/ui.html",
    favorite: false,
  },
];

export function getApp(id: string): AppDefinition | undefined {
  return APPS.find((a) => a.id === id);
}

export function getAppByPort(port: number): AppDefinition | undefined {
  return APPS.find((a) => a.port === port);
}