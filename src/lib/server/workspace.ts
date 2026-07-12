// Active workspace state + path-traversal guard.
// All fs/git API routes are confined to the currently active workspace roots.
// State lives on globalThis so the custom server and Next route bundles share it.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

export interface WorkspaceRoot {
  /** Absolute path of the folder. */
  path: string;
  /** Display name (folder name or workspace `name` entry). */
  name: string;
}

interface WorkspaceState {
  /** The .code-workspace file (or folder) currently open. */
  source: string | null;
  roots: WorkspaceRoot[];
}

const g = globalThis as unknown as { __mmcWorkspace?: WorkspaceState };
const state: WorkspaceState =
  g.__mmcWorkspace ?? (g.__mmcWorkspace = { source: null, roots: [] });

export function getActiveWorkspace(): WorkspaceState {
  return state;
}

export function setActiveWorkspace(source: string, roots: WorkspaceRoot[]): void {
  state.source = source;
  state.roots = roots;
}

/**
 * Resolve a requested path and assert it lives inside one of the active
 * workspace roots. Throws on traversal attempts (`..`, symlink-free check
 * is textual by design — roots are trusted local folders).
 */
export function assertInsideWorkspace(requested: string): string {
  const resolved = path.resolve(requested);
  const ok = state.roots.some(
    (r) => resolved === r.path || resolved.startsWith(r.path + path.sep)
  );
  if (!ok) {
    throw new WorkspaceAccessError(
      `Path is outside the active workspace roots: ${resolved}`
    );
  }
  return resolved;
}

export class WorkspaceAccessError extends Error {}

/** Locations scanned for `*.code-workspace` files (FR-3.4.1). */
export function workspaceSearchDirs(): string[] {
  const home = os.homedir();
  return [home, path.join(home, "Projects"), path.join(home, "Desktop"), path.join(home, "Documents")];
}

export async function findWorkspaceFiles(): Promise<string[]> {
  const found: string[] = [];
  for (const dir of workspaceSearchDirs()) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".code-workspace")) {
        found.push(path.join(dir, e.name));
      }
      // One level deep inside ~/Projects etc. — workspaces often live
      // next to the repos they reference.
      if (e.isDirectory() && !e.name.startsWith(".")) {
        try {
          const sub = await fs.readdir(path.join(dir, e.name));
          for (const f of sub) {
            if (f.endsWith(".code-workspace")) found.push(path.join(dir, e.name, f));
          }
        } catch {
          /* unreadable dir — skip */
        }
      }
    }
  }
  return [...new Set(found)];
}

/** Parse a .code-workspace file into resolved absolute roots (FR-3.4.2). */
export async function parseWorkspaceFile(file: string): Promise<WorkspaceRoot[]> {
  const raw = await fs.readFile(file, "utf8");
  // .code-workspace is JSONC — strip comments and trailing commas.
  const json = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
  const parsed = JSON.parse(json) as {
    folders?: Array<{ path?: string; name?: string }>;
  };
  const baseDir = path.dirname(file);
  const roots: WorkspaceRoot[] = [];
  for (const f of parsed.folders ?? []) {
    if (!f.path) continue;
    const abs = path.isAbsolute(f.path) ? f.path : path.resolve(baseDir, f.path);
    roots.push({ path: abs, name: f.name ?? path.basename(abs) });
  }
  return roots;
}
