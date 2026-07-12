// Write a file (mini-editor save, FR-3.3.3). Confined to the active
// workspace roots like every fs/git endpoint.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertInsideWorkspace, WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

const MAX_WRITE_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let body: { path?: string; content?: string; previewed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.path || typeof body.content !== "string") {
    return NextResponse.json({ error: "path and content required" }, { status: 400 });
  }
  // FR-3.1.5 contract: the client must confirm the user saw the content
  // before it lands on disk (mini-editor / diff preview) — no blind writes.
  if (body.previewed !== true) {
    return NextResponse.json(
      { error: "previewed:true is required (show the content before writing)" },
      { status: 400 }
    );
  }
  if (Buffer.byteLength(body.content) > MAX_WRITE_BYTES) {
    return NextResponse.json({ error: "content too large" }, { status: 413 });
  }
  try {
    const file = assertInsideWorkspace(body.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body.content, "utf8");
    return NextResponse.json({ ok: true, path: file });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
