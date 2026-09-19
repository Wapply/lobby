import { spawn } from "bun";
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const BIN_DIR = "C:\\Portables\\upscayl-2.15.0-win\\resources\\bin";
const UPSCAYL_EXE = join(BIN_DIR, "upscayl-bin.exe");
const MODELS_DIR = "C:\\Portables\\upscayl-2.15.0-win\\resources\\models";
const DEFAULT_OUTPUT = "C:\\w_lan";
const UPLOADS_DIR = join(import.meta.dir, "uploads");

export interface UpscaleResult {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export function ensureDirs() {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!existsSync(DEFAULT_OUTPUT)) mkdirSync(DEFAULT_OUTPUT, { recursive: true });
}

export function defaultOutputDir() {
  return DEFAULT_OUTPUT;
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

/**
 * Save an uploaded file to a temp location and upscale it with upscayl-bin.
 * Returns the final output path.
 */
export async function upscaleImage(
  inputBytes: Uint8Array,
  originalName: string,
  options: { outputDir?: string; scale?: string; model?: string },
): Promise<UpscaleResult> {
  ensureDirs();

  const ext = extname(originalName) || ".png";
  const inputPath = join(UPLOADS_DIR, `${Date.now()}-${originalName}`);
  const outputDir =
    options.outputDir && options.outputDir.trim() ? options.outputDir : DEFAULT_OUTPUT;
  const outputFileName = `upscaled-${Date.now()}${ext}`;

  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {
    return { ok: false, error: `No se pudo crear la carpeta de salida: ${outputDir}` };
  }

  const outputPath = join(outputDir, outputFileName);
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
    return { ok: true, outputPath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}