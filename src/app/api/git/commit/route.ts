// FR-3.2.3 — Commit & Push quick-action macro.
import { NextRequest, NextResponse } from "next/server";
import { gitCommitAndPush } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { root?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.root || !body.message?.trim()) {
    return NextResponse.json({ error: "root and message required" }, { status: 400 });
  }
  try {
    const { log, pushed } = await gitCommitAndPush(body.root, body.message.trim());
    return NextResponse.json({ log, pushed });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message?: string };
    return NextResponse.json({ error: e.stderr || e.message || "git failed" }, { status });
  }
}
