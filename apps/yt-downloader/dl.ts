import { spawn, type Subprocess } from "bun";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const YT_DLP = `C:\\Portables\\open-video-downloader\\yt-dlp.exe`;
const TEMP_DIR = join(import.meta.dir, ".tmp");

// Track active downloads for cancellation
const activeDownloads = new Map<string, Subprocess>();

export interface DownloadRequest {
  url: string;
  formatId?: string;
  audioBitrate?: string;
  embedThumbnail?: boolean;
}

export interface DownloadState {
  id: string;
  pct: number;
  line: string;
  done: boolean;
  error?: string;
  filename?: string;
}

function ensureTemp() {
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
}

export function tempFilePath(name: string): string {
  return join(TEMP_DIR, name);
}

export function cancelDownload(id: string): boolean {
  const proc = activeDownloads.get(id);
  if (proc) {
    proc.kill();
    activeDownloads.delete(id);
    return true;
  }
  return false;
}

export function cancelAllDownloads() {
  for (const [id, proc] of activeDownloads) {
    proc.kill();
    activeDownloads.delete(id);
  }
}

export async function listFormats(url: string): Promise<{ ok: boolean; formats?: any[]; error?: string }> {
  try {
    const proc = spawn([YT_DLP, "--no-playlist", "-J", url], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const data = JSON.parse(out);
    const formats = (data.formats || []).map((f: any) => ({
      id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || null,
      filesize: f.filesize || f.filesize_approx || null,
      formatNote: f.format_note || null,
      vcodec: f.vcodec,
      acodec: f.acodec,
      tbr: f.tbr,
      abr: f.abr,
    }));
    return { ok: true, formats };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function startDownload(
  id: string,
  req: DownloadRequest,
  onProgress: (pct: number, line: string) => void,
  onDone: (filename?: string, error?: string) => void,
): Promise<void> {
  ensureTemp();
  const args = ["--no-playlist", "--newline", "--progress", "--no-part"];

  if (req.formatId) args.push("-f", req.formatId);
  if (req.audioBitrate) args.push("--audio-quality", req.audioBitrate);
  if (req.embedThumbnail) args.push("--embed-thumbnail");

  args.push("-o", join(TEMP_DIR, "%(title).200s.%(ext)s"));
  args.push("--print", "after_move:FINAL:%(filepath)s");
  args.push(req.url);

  try {
    const proc = spawn([YT_DLP, ...args], { stdout: "pipe", stderr: "pipe" });
    activeDownloads.set(id, proc);

    let finalPath: string | undefined;
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("FINAL:")) {
            finalPath = trimmed.slice("FINAL:".length).trim();
          } else if (trimmed.includes("[download]")) {
            onProgress(parseProgress(trimmed), trimmed);
          }
        }
      }
    })();

    const exitCode = await proc.exited;
    activeDownloads.delete(id);

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      onDone(undefined, stderr.trim() || `exited with code ${exitCode}`);
      return;
    }
    if (!finalPath) {
      onDone(undefined, "no se pudo determinar el archivo de salida");
      return;
    }
    onDone(finalPath);
  } catch (e) {
    activeDownloads.delete(id);
    onDone(undefined, String(e));
  }
}

function parseProgress(line: string): number {
  const match = line.match(/(\d+\.?\d*)%/);
  if (match && match[1] !== undefined) return parseFloat(match[1]);
  return 0;
}

export function getActiveDownloadCount(): number {
  return activeDownloads.size;
}