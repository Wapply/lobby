import { Hono } from "hono";
import { serve } from "bun";
import { APPS, getApp } from "./core/registry";
import { ProcessManager } from "./core/process-manager";
import { downloadAudio, downloadVideo } from "./apps/yt-downloader/dl";

const STATE_FILE = `${import.meta.dir}/data/apps-state.json`;

const pm = new ProcessManager(STATE_FILE);
await pm.init();

for (const id of pm.pendingRestore()) {
  const def = getApp(id);
  if (def) await pm.start(def);
}

const app = new Hono();

app.get("/", async (c) => {
  const html = await Bun.file(`${import.meta.dir}/ui/layout.html`).text();
  return c.html(html);
});

app.get("/apps/:id/ui", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.text("App not found", 404);
  return serveFile(c, `${import.meta.dir}/${def.ui}`);
});

// Proxy API — only for apps that run as child processes
app.all("/apps/:id/api/*", async (c) => {
  const id = c.req.param("id");
  const def = getApp(id);
  if (!def) return c.json({ error: "not found" }, 404);

  // yt-downloader is built-in, handled directly
  if (id === "yt-downloader") {
    const rest = c.req.path.slice(`/apps/${id}/api/`.length);
    if (c.req.method === "POST" && rest === "download") {
      const body = await c.req.parseBody();
      const result = await downloadAudio({
        url: String(body.url || ""),
        format: String(body.format || ""),
        audioOnly: true,
      });
      return c.json(result);
    }
    if (c.req.method === "POST" && rest === "download-video") {
      const body = await c.req.parseBody();
      const result = await downloadVideo({
        url: String(body.url || ""),
        quality: String(body.quality || "best"),
      });
      return c.json(result);
    }
    if (c.req.method === "GET" && rest === "status") {
      return c.json({ ok: true });
    }
    return c.json({ error: "not found" }, 404);
  }

  // For other apps, proxy to child process
  if (pm.status(id) !== "running") {
    return c.json({ error: "app not running" }, 409);
  }
  const rest = c.req.path.slice(`/apps/${def.id}/api/`.length);
  const url = `http://127.0.0.1:${def.port}/${rest}`;
  const body = ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text();
  const upstream = await fetch(url, {
    method: c.req.method,
    headers: c.req.header(),
    body,
  });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
});

app.get("/api/apps", (c) => {
  const statuses = pm.list();
  const map = Object.fromEntries(statuses.map((s) => [s.id, s]));
  return c.json(
    APPS.map((a) => ({
      ...a,
      status: a.id === "yt-downloader" ? "running" : (map[a.id]?.status ?? "off"),
      lastError: map[a.id]?.lastError,
    }))
  );
});

app.post("/api/apps/:id/start", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (def.id === "yt-downloader") {
    return c.json({ id: def.id, status: "running" });
  }
  await pm.start(def);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/apps/:id/stop", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (def.id === "yt-downloader") {
    return c.json({ id: def.id, status: "running" });
  }
  pm.stop(def.id);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/:id/restart", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (def.id === "yt-downloader") return c.json({ id: def.id, status: "running" });
  await pm.restart(def.id);
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/stop-all", async (c) => {
  pm.stopAll();
  await pm.savePersisted();
  return c.json({ ok: true });
});

app.get("/api/health/:id", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ ok: false }, 404);
  if (def.id === "yt-downloader") return c.json({ ok: true });
  const ok = pm.status(def.id) === "running" && (await probe(def.port));
  return c.json({ ok });
});

function probe(port: number): Promise<boolean> {
  return fetch(`http://127.0.0.1:${port}`).then(() => true).catch(() => false);
}

async function serveFile(c: any, fullPath: string) {
  const file = Bun.file(fullPath);
  if (!file.exists()) return c.text("Not found", 404);
  return new Response(file);
}

const server = serve({
  port: 3000,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

console.log(`Lobby listening on http://127.0.0.1:${server.port}`);