import { Hono } from "hono";
import { serve } from "bun";
import { APPS, getApp } from "./core/registry";
import { ProcessManager } from "./core/process-manager";
import {
  listFormats,
  startDownload,
  cancelDownload,
  cancelAllDownloads,
} from "./apps/yt-downloader/dl";

const STATE_FILE = `${import.meta.dir}/data/apps-state.json`;

const pm = new ProcessManager(STATE_FILE);
await pm.init();

for (const id of pm.pendingRestore()) {
  const def = getApp(id);
  if (def) await pm.start(def);
}

// In-memory progress store: downloadId -> { pct, line }
const progressStore = new Map<string, { pct: number; line: string; done: boolean; error?: string }>();

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

app.all("/apps/:id/api/*", async (c) => {
  const id = c.req.param("id");
  const def = getApp(id);
  if (!def) return c.json({ error: "not found" }, 404);

  if (id === "yt-downloader") {
    const rest = c.req.path.slice(`/apps/${id}/api/`.length);

    if (c.req.method === "POST" && rest === "list-formats") {
      const body = await c.req.parseBody();
      return c.json(await listFormats(String(body.url || "")));
    }

    if (c.req.method === "POST" && rest === "start-download") {
      const body = await c.req.parseBody();
      const dlId = `dl-${Date.now()}`;
      progressStore.set(dlId, { pct: 0, line: "", done: false });

      const result = await startDownload(
        {
          url: String(body.url || ""),
          formatId: String(body.formatId || ""),
          outputDir: String(body.outputDir || "C:\\Users\\klein\\Downloads"),
          audioBitrate: String(body.audioBitrate || ""),
          embedThumbnail: body.embedThumbnail === "1",
        },
        (pct, line) => {
          const entry = progressStore.get(dlId);
          if (entry) { entry.pct = pct; entry.line = line; }
        },
      );

      const entry = progressStore.get(dlId);
      if (entry) {
        entry.done = true;
        if (!result.ok) entry.error = result.error;
      }
      return c.json({ ...result, id: dlId });
    }

    if (c.req.method === "GET" && rest.startsWith("progress/")) {
      const dlId = rest.slice("progress/".length);
      const entry = progressStore.get(dlId);
      if (!entry) return c.json({ done: true, error: "not found" });
      return c.json(entry);
    }

    if (c.req.method === "POST" && rest.startsWith("cancel/")) {
      const dlId = rest.slice("cancel/".length);
      const ok = cancelDownload(dlId);
      progressStore.set(dlId, { pct: 0, line: "cancelado", done: true, error: "cancelado" });
      return c.json({ ok });
    }

    if (c.req.method === "GET" && rest === "status") {
      return c.json({ ok: true });
    }

    return c.json({ error: "not found" }, 404);
  }

  if (pm.status(id) !== "running") {
    return c.json({ error: "app not running" }, 409);
  }
  const rest = c.req.path.slice(`/apps/${def.id}/api/`.length);
  const url = `http://127.0.0.1:${def.port}/${rest}`;
  const body = ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text();
  const upstream = await fetch(url, { method: c.req.method, headers: c.req.header(), body });
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
  if (def.id === "yt-downloader") return c.json({ id: def.id, status: "running" });
  await pm.start(def);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/apps/:id/stop", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (def.id === "yt-downloader") return c.json({ id: def.id, status: "running" });
  pm.stop(def.id);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/apps/:id/restart", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (def.id === "yt-downloader") return c.json({ id: def.id, status: "running" });
  await pm.restart(def.id);
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/stop-all", async (c) => {
  cancelAllDownloads();
  pm.stopAll();
  await pm.savePersisted();
  return c.json({ ok: true });
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