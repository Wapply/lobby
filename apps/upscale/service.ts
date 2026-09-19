import { spawn } from "bun";
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const BIN_DIR = "C:\\Portables\\upscayl-2.15.0-win\\resources\\bin";
const UPSCAYL_EXE = join(BIN_DIR, "upscayl-bin.exe");
const MODELS_DIR = "C:\\Portables\\upscayl-2.15.0-win\\resources\\models";
const UPLOADS_DIR = join(import.meta.dir, ".uploads");
const OUT_DIR = join(import.meta.dir, ".out");

export interface UpscaleResult {
  ok: boolean;
  filename?: string;
  downloadName?: string;
  error?: string;
}

export function ensureDirs() {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
}

export function outFilePath(name: string): string {
  return join(OUT_DIR, name);
}

export function listModels(): { id: string; name: string }[] {
  const models = [
    "upscayl-standard-4x",
    "upscayl-lite-4x",
    "ultramix-balanced-4x",
    "ultrasharp-4x",
    "remacri-4x",
    "high-fidelity-4x",
    "digital-art-4x",
  ];
  return models.map((m) => ({ id: m, name: m }));
}

export async function upscaleImage(
  inputBytes: Uint8Array,
  originalName: string,
  options: { scale?: string; model?: string },
): Promise<UpscaleResult> {
  ensureDirs();

  const safeName = basename(originalName || "image.png");
  const ext = extname(safeName) || ".png";
  const inputPath = join(UPLOADS_DIR, `${Date.now()}-${safeName}`);
  const outName = `upscaled-${Date.now()}${ext}`;
  const outputPath = join(OUT_DIR, outName);
  const scale = options.scale || "4";
  const model = options.model || "upscayl-standard-4x";

  try {
    writeFileSync(inputPath, inputBytes);
  } catch (e) {
    return { ok: false, error: `No se pudo escribir el archivo temporal: ${String(e)}` };
  }

  const args = [
    "-i", inputPath,
    "-o", outputPath,
    "-m", MODELS_DIR,
    "-s", scale,
    "-n", model,
  ];

  try {
    const proc = spawn([UPSCAYL_EXE, ...args], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (existsSync(inputPath)) unlinkSync(inputPath);

    if (code !== 0) {
      return { ok: false, error: stderr.trim() || `upscayl-bin exited with code ${code}` };
    }
    return { ok: true, filename: outName, downloadName: `upscaled-${safeName}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}