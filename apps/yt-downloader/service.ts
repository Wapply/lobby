import { Hono } from "hono";
import { spawn } from "bun";

const YT_DLP = `C:\\Portables\\open-video-downloader\\yt-dlp.exe`;

export function createApp() {
  const app = new Hono();
  let lastError: string | undefined;

  app.get("/", (c) => c.html("yt-downloader service up"));

  app.post("/download", async (c) => {
    const body = await c.req.parseBody();
    const url = String(body.url || "");
    if (!url) return c.json({ error: "url required" }, 400);

    try {
      const proc = spawn([YT_DLP, "--no-playlist", "-f", "bestaudio", "-o", "%(title)s.%(ext)s", url]);
      await proc.exited;
      return c.json({ ok: true });
    } catch (e) {
      lastError = String(e);
      return c.json({ error: lastError }, 500);
    }
  });

  app.post("/download-video", async (c) => {
    const body = await c.req.parseBody();
    const url = String(body.url || "");
    if (!url) return c.json({ error: "url required" }, 400);

    try {
      const proc = spawn([YT_DLP, "--no-playlist", "-f", "best", "-o", "%(title)s.%(ext)s", url]);
      await proc.exited;
      return c.json({ ok: true });
    } catch (e) {
      lastError = String(e);
      return c.json({ error: lastError }, 500);
    }
  });

  app.get("/status", (c) => c.json({ ok: true, error: lastError }));
  return app;
}