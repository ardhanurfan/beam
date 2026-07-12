// Create or edit a skill file (guarded to agent skill directories —
// "~/.zshrc" and friends are rejected with 403).
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertSkillPath, SkillAccessError } from "@/lib/server/agents";

export const dynamic = "force-dynamic";

const MAX_WRITE_BYTES = 512 * 1024;

export async function POST(req: NextRequest) {
  let body: { path?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.path || typeof body.content !== "string") {
    return NextResponse.json({ error: "path and content required" }, { status: 400 });
  }
  if (Buffer.byteLength(body.content) > MAX_WRITE_BYTES) {
    return NextResponse.json({ error: "content too large" }, { status: 413 });
  }
  try {
    const file = assertSkillPath(body.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body.content, "utf8");
    return NextResponse.json({ ok: true, path: file });
  } catch (err) {
    const status = err instanceof SkillAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
