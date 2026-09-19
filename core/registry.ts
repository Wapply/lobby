import type { AppDefinition } from "./types";

export const APPS: AppDefinition[] = [
  {
    id: "yt-downloader",
    name: "YT Downloader",
    description: "Descarga audio/video con yt-dlp.",
    icon: "download",
    port: 0,
    command: [],
    ui: "apps/yt-downloader/ui.html",
    favorite: true,
  },
  {
    id: "upscale",
    name: "Upscale",
    description: "Escalado de imágenes con IA (Real-ESRGAN).",
    icon: "zoom",
    port: 0,
    command: [],
    ui: "apps/upscale/ui.html",
    favorite: true,
  },
];

export function getApp(id: string): AppDefinition | undefined {
  return APPS.find((a) => a.id === id);
}

export function getAppByPort(port: number): AppDefinition | undefined {
  return APPS.find((a) => a.port === port);
}