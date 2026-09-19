import { readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface BrowseResult {
  currentPath: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  drives?: string[];
}

/** List available Windows drive roots (C:\, D:\ ...). */
export function listDrives(): string[] {
  const drives: string[] = [];
  for (let c = 67; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const root = `${letter}:\\`;
    if (existsSync(root)) drives.push(root);
  }
  return drives;
}

/**
 * Read directory listings for the folder picker.
 * Returns subdirectories only, plus the parent path.
 */
export function browse(path: string): BrowseResult {
  const base = path && path.trim() ? resolve(path) : "C:\\";

  if (!existsSync(base)) {
    return { currentPath: base, parent: null, dirs: [] };
  }

  const dirs: { name: string; path: string }[] = [];
  try {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, path: join(base, entry.name) });
      }
    }
  } catch {
    /* permission denied etc. */
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));

  const parent = dirname(base);
  return {
    currentPath: base,
    parent: parent === base ? null : parent,
    dirs,
    drives: listDrives(),
  };
}