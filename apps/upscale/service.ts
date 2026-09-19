import { Hono } from "hono";

/**
 * Upscale app — spawned as a child process by the lobby.
 * Skeleton service; replace with real upscaling logic (e.g. Real-ESRGAN).
 */
export function createApp() {
  const app = new Hono();
  app.get("/", (c) => c.html("upscale service up"));
  app.get("/status", (c) => c.json({ ok: true }));
  app.post("/upscale", (c) => c.json({ ok: false, error: "no handler yet" }));
  return app;
}