import { spawn, type Subprocess } from "bun";

const YT_DLP = `C:\\Portables\\open-video-downloader\\yt-dlp.exe`;

// Track active downloads for cancellation
const activeDownloads = new Map<string, Subprocess>();
let downloadIdCounter = 0;

export interface DownloadRequest {
  url: string;
  formatId?: string;       // from yt-dlp -F (e.g. "140" for m4a)
  outputDir: string;
  audioBitrate?: string;   // e.g. "128K", "320K"
  embedThumbnail?: boolean;
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
    const proc = spawn([YT_DLP, "--no-playlist", "-J", "-F", url], { stdout: "pipe", stderr: "pipe" });
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
  req: DownloadRequest,
  onProgress: (pct: number, line: string) => void,
): Promise<{ id: string; ok: boolean; error?: string }> {
  const id = `dl-${++downloadIdCounter}`;
  const args = ["--no-playlist", "--newline", "--progress"];

  if (req.formatId) args.push("-f", req.formatId);
  if (req.audioBitrate) args.push("--audio-quality", req.audioBitrate);
  if (req.embedThumbnail) args.push("--embed-thumbnail");

  args.push("-o", `${req.outputDir}/%(title).200s.%(ext)s`, req.url);

  try {
    const proc = spawn([YT_DLP, ...args], { stdout: "pipe", stderr: "pipe" });
    activeDownloads.set(id, proc);

    // Read progress from stdout
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    (async () => {
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.includes("[download]")) {
            onProgress(parseProgress(line), line.trim());
          }
        }
      }
    })();

    const exitCode = await proc.exited;
    activeDownloads.delete(id);

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { id, ok: false, error: stderr.trim() || `exited with code ${exitCode}` };
    }
    return { id, ok: true };
  } catch (e) {
    activeDownloads.delete(id);
    return { id, ok: false, error: String(e) };
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