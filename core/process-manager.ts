import type { AppDefinition, AppStatus } from "./types";

interface ManagedProcess {
  proc?: Bun.Subprocess;
  def: AppDefinition;
  status: AppStatus;
  startedAt: number;
  lastError?: string;
  /** True when stop() killed the process on purpose. */
  intentionalStop?: boolean;
}

/**
 * Tracks on/off state for every app.
 *
 * - Child-process apps (def.command non-empty): start spawns the process,
 *   stop kills it. Status reflects the real process state.
 * - Built-in apps (def.command empty, e.g. yt-downloader): start/stop only
 *   flips an in-memory enabled flag; there is no process to spawn.
 */
export class ProcessManager {
  private procs = new Map<string, ManagedProcess>();
  private persistPath: string;
  private persisted = new Set<string>();

  constructor(persistPath: string) {
    this.persistPath = persistPath;
  }

  async init() {
    await this.loadPersisted();
  }

  private async loadPersisted() {
    try {
      const raw = Bun.file(this.persistPath);
      const data = (await raw.exists()) ? JSON.parse(await raw.text()) : [];
      if (Array.isArray(data)) {
        for (const id of data) this.persisted.add(String(id));
      }
    } catch {
      /* first run or corrupt file */
    }
  }

  async savePersisted() {
    const on = [...this.procs.values()]
      .filter((m) => m.status === "running")
      .map((m) => m.def.id);
    await Bun.write(this.persistPath, JSON.stringify(on));
  }

  private setStatus(def: AppDefinition, status: AppStatus, error?: string) {
    const m = this.procs.get(def.id);
    if (!m) return;
    m.status = status;
    m.lastError = error;
    this.procs.set(def.id, m);
  }

  isBuiltIn(def: AppDefinition) {
    return def.command.length === 0;
  }

  async start(def: AppDefinition) {
    const existing = this.procs.get(def.id);

    // Built-in app: just flip the flag, no process.
    if (this.isBuiltIn(def)) {
      if (existing?.status === "running") return existing;
      this.procs.set(def.id, { def, status: "running", startedAt: Date.now() });
      return this.procs.get(def.id);
    }

    // Already running?
    if (existing?.status === "running") return existing;

    const proc = Bun.spawn({
      cmd: def.command,
      cwd: `${import.meta.dir}/../apps/${def.id}`,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.procs.set(def.id, {
      proc,
      def,
      status: "running",
      startedAt: Date.now(),
      intentionalStop: false,
    });

    proc.exited.then((code) => {
      if (this.procs.get(def.id)?.intentionalStop) return;
      this.setStatus(def, code === 0 ? "off" : "error", `exited with code ${code}`);
    });
    return this.procs.get(def.id);
  }

  stop(id: string) {
    const m = this.procs.get(id);
    if (!m) return false;

    m.intentionalStop = true;
    if (m.proc) {
      m.proc.kill();
    }
    m.status = "off";
    m.startedAt = 0;
    this.procs.set(id, m);
    return true;
  }

  restart(id: string) {
    const def = this.procs.get(id)?.def;
    this.stop(id);
    if (def) return this.start(def);
    return undefined;
  }

  stopAll() {
    for (const id of [...this.procs.keys()]) this.stop(id);
  }

  status(id: string) {
    return this.procs.get(id)?.status ?? "off";
  }

  list() {
    return [...this.procs.values()].map((m) => ({
      id: m.def.id,
      status: m.status,
      startedAt: m.startedAt,
      lastError: m.lastError,
    }));
  }

  pendingRestore() {
    return [...this.persisted];
  }
}