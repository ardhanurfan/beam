// FR-3.3.1 — File Tree Lazy-Loading: ONE directory level per request.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertInsideWorkspace, WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

const HIDDEN = new Set([".git", "node_modules", ".next", "__pycache__", ".DS_Store"]);

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("path");
  if (!requested) return NextResponse.json({ error: "path required" }, { status: 400 });
  try {
    const dir = assertInsideWorkspace(requested);
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const entries = dirents
      .filter((d) => !HIDDEN.has(d.name))
      .map((d) => ({
        name: d.name,
        path: path.join(dir, d.name),
        type: d.isDirectory() ? ("dir" as const) : ("file" as const),
      }))
      .sort((a, b) =>
        a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)
      );
    return NextResponse.json({ entries });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
