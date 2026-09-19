import { Hono } from "hono";
import { serve } from "bun";
import { APPS, getApp, getAppByPort } from "./core/registry";
import { ProcessManager } from "./core/process-manager";

const STATE_FILE = `${import.meta.dir}/data/apps-state.json`;

const pm = new ProcessManager(STATE_FILE);
await pm.init();

// Restore apps that were running last session.
for (const id of pm.pendingRestore()) {
  const def = getApp(id);
  if (def) await pm.start(def);
}

const app = new Hono();

app.get("/", async (c) => {
  const html = await Bun.file(`${import.meta.dir}/ui/layout.html`).text();
  return c.html(html);
});

// Serve app UIs + assets.
// Serve an app's UI (its registered ui.html file).
app.get("/apps/:id/ui", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.text("App not found", 404);
  return serveFile(c, `${import.meta.dir}/${def.ui}`);
});

// Proxy API calls from an app's UI to the app's own service port.
app.all("/apps/:id/api/*", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  if (pm.status(def.id) !== "running") {
    return c.json({ error: "app not running" }, 409);
  }
  const rest = c.req.path.slice(`/apps/${def.id}/api/`.length);
  const url = `http://127.0.0.1:${def.port}/${rest}`;
  const upstream = await fetch(url, {
    method: c.req.method,
    headers: c.req.header(),
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text(),
  });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
});

// ---------- API ----------
app.get("/api/apps", (c) => {
  const statuses = pm.list();
  const map = Object.fromEntries(statuses.map((s) => [s.id, s]));
  return c.json(
    APPS.map((a) => ({
      ...a,
      status: map[a.id]?.status ?? "off",
      lastError: map[a.id]?.lastError,
    }))
  );
});

app.post("/api/apps/:id/start", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  await pm.start(def);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/apps/:id/stop", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  pm.stop(def.id);
  await pm.savePersisted();
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/apps/:id/restart", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ error: "not found" }, 404);
  await pm.restart(def.id);
  return c.json({ id: def.id, status: pm.status(def.id) });
});

app.post("/api/stop-all", async (c) => {
  pm.stopAll();
  await pm.savePersisted();
  return c.json({ ok: true });
});

// Healthcheck per app.
app.get("/api/health/:id", async (c) => {
  const def = getApp(c.req.param("id"));
  if (!def) return c.json({ ok: false }, 404);
  const ok = pm.status(def.id) === "running" && (await probe(def.port));
  return c.json({ ok });
});

function probe(port: number): Promise<boolean> {
  return fetch(`http://127.0.0.1:${port}`)
    .then(() => true)
    .catch(() => false);
}

// Serve a static file safely (no path traversal outside app dir).
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