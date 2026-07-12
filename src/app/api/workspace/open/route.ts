// Open a plain folder as a single-root workspace (no .code-workspace needed).
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setActiveWorkspace } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { path: requested } = (await req.json()) as { path?: string };
  if (!requested) return NextResponse.json({ error: "path required" }, { status: 400 });

  const home = os.homedir();
  const dir = path.resolve(requested);
  if (dir !== home && !dir.startsWith(home + path.sep)) {
    return NextResponse.json({ error: "path outside home directory" }, { status: 403 });
  }

  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    return NextResponse.json({ error: "not a directory" }, { status: 400 });
  }

  const roots = [{ path: dir, name: path.basename(dir) }];
  setActiveWorkspace(dir, roots);
  return NextResponse.json({ source: dir, roots });
}
