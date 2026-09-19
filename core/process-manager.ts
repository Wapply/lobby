import type { AppDefinition, AppStatus } from "./types";

interface ManagedProcess {
  proc: Bun.Subprocess;
  def: AppDefinition;
  status: AppStatus;
  startedAt: number;
  lastError?: string;
}

/**
 * Spawns, kills and health-checks child processes for each app.
 * On shutdown it also persists which apps should be restarted next boot.
 */
export class ProcessManager {
  private procs = new Map<string, ManagedProcess>();
  private persistPath: string;
  /** Apps that were running last session; restored on boot. */
  private persisted = new Set<string>();

  constructor(persistPath: string) {
    this.persistPath = persistPath;
  }

  /** Must be awaited once before using the manager. */
  async init() {
    await this.loadPersisted();
  }

  private async loadPersisted() {
    try {
      const raw = Bun.file(this.persistPath);
      const data = (await raw.exists()) ? JSON.parse(await raw.text()) : [];
      for (const id of data) this.persisted.add(id);
    } catch {
      /* first run or corrupt file */
    }
  }

  async savePersisted() {
    const running = [...this.procs.values()]
      .filter((m) => m.status === "running")
      .map((m) => m.def.id);
    await Bun.write(this.persistPath, JSON.stringify(running));
  }

  private mark(def: AppDefinition, status: AppStatus, error?: string) {
    const m = this.procs.get(def.id);
    if (!m) return;
    m.status = status;
    m.lastError = error;
    this.procs.set(def.id, m);
  }

  async start(def: AppDefinition) {
    const existing = this.procs.get(def.id);
    if (existing?.status === "running") return existing;

    const proc = Bun.spawn({
      cmd: def.command,
      cwd: `${import.meta.dir}/../apps/${def.id}`,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.procs.set(def.id, { proc, def, status: "starting", startedAt: Date.now() });

    proc.exited.then((code) => {
      this.mark(def, code === 0 ? "off" : "error", `exited with code ${code}`);
    });
    return this.procs.get(def.id);
  }

  stop(id: string) {
    const m = this.procs.get(id);
    if (!m) return false;
    m.proc.kill();
    this.mark(m.def, "off");
    return true;
  }

  restart(id: string) {
    this.stop(id);
    const def = this.procs.get(id)?.def;
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

  /** Apps that should be auto-restored from the previous session. */
  pendingRestore() {
    return [...this.persisted];
  }
}