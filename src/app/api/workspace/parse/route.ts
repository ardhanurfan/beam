// FR-3.4.2 — parse a .code-workspace file (JSONC-tolerant) into absolute
// roots and make it the active workspace.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseWorkspaceFile, setActiveWorkspace } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("file");
  if (!requested) return NextResponse.json({ error: "file required" }, { status: 400 });

  const home = os.homedir();
  const file = path.resolve(requested);
  if (file !== home && !file.startsWith(home + path.sep)) {
    return NextResponse.json({ error: "file outside home directory" }, { status: 403 });
  }
  if (!file.endsWith(".code-workspace")) {
    return NextResponse.json({ error: "not a .code-workspace file" }, { status: 400 });
  }
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  try {
    const roots = await parseWorkspaceFile(file);
    if (roots.length === 0) {
      return NextResponse.json({ error: "workspace has no folders" }, { status: 400 });
    }
    setActiveWorkspace(file, roots);
    return NextResponse.json({ source: file, roots });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
