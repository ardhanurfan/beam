// FR-3.2.5 — Panic Rollback. DESTRUCTIVE: discards all uncommitted changes
// and untracked files. The client must echo the exact server-side confirm
// token, which the UI only sends after the two-step dialog.
import { NextRequest, NextResponse } from "next/server";
import { gitPanicRollback } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";
import { ROLLBACK_CONFIRM_TOKEN } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { root?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.root || body.confirm !== ROLLBACK_CONFIRM_TOKEN) {
    return NextResponse.json(
      { error: "root and the exact confirm token are required" },
      { status: 400 }
    );
  }
  try {
    const log = await gitPanicRollback(body.root);
    return NextResponse.json({ log });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message?: string };
    return NextResponse.json({ error: e.stderr || e.message || "git failed" }, { status });
  }
}
