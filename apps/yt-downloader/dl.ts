import { spawn } from "bun";

const YT_DLP = `C:\\Portables\\open-video-downloader\\yt-dlp.exe`;

export interface DownloadOpts {
  url: string;
  format?: string;
  audioOnly?: boolean;
  quality?: string;
}

export async function downloadAudio(opts: DownloadOpts): Promise<{ ok: boolean; error?: string }> {
  try {
    const args = ["--no-playlist"];
    if (opts.format) {
      args.push("-f", opts.format);
    } else {
      args.push("-f", "bestaudio");
    }
    args.push("-o", "%(title)s.%(ext)s");
    args.push(opts.url);
    const proc = spawn([YT_DLP, ...args], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { ok: false, error: stderr.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function downloadVideo(opts: DownloadOpts): Promise<{ ok: boolean; error?: string }> {
  try {
    const args = ["--no-playlist"];
    if (opts.quality) {
      if (opts.quality === "best") {
        args.push("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
      } else if (opts.quality === "4k") {
        args.push("-f", "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]");
      } else if (opts.quality === "1080p") {
        args.push("-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]");
      } else if (opts.quality === "720p") {
        args.push("-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]");
      } else if (opts.quality === "480p") {
        args.push("-f", "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]");
      } else {
        args.push("-f", opts.format || "best");
      }
    } else {
      args.push("-f", opts.format || "best");
    }
    args.push("-o", "%(title)s.%(ext)s");
    args.push(opts.url);
    const proc = spawn([YT_DLP, ...args], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { ok: false, error: stderr.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}