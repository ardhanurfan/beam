// Folder browser for the workspace picker: list subdirectories (and any
// .code-workspace files) one level at a time, confined to the home subtree.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

const HIDDEN = new Set(["node_modules", ".git", ".Trash", "Library"]);

export async function GET(req: NextRequest) {
  const home = os.homedir();
  const requested = req.nextUrl.searchParams.get("path") ?? home;
  const dir = path.resolve(requested);

  // Picker is confined to the home subtree — never browse system paths.
  if (dir !== home && !dir.startsWith(home + path.sep)) {
    return NextResponse.json({ error: "path outside home directory" }, { status: 403 });
  }

  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const dirs = dirents
      .filter((d) => d.isDirectory() && !HIDDEN.has(d.name) && !d.name.startsWith("."))
      .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const workspaceFiles = dirents
      .filter((d) => d.isFile() && d.name.endsWith(".code-workspace"))
      .map((d) => ({ name: d.name, path: path.join(dir, d.name) }));
    return NextResponse.json({
      path: dir,
      parent: dir === home ? null : path.dirname(dir),
      dirs,
      workspaceFiles,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
