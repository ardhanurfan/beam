// FR-3.2.4 — Quick-Action Macro: Stash (non-destructive).
import { NextRequest, NextResponse } from "next/server";
import { gitQuickStash } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { root } = (await req.json()) as { root?: string };
  if (!root) return NextResponse.json({ error: "root required" }, { status: 400 });
  try {
    return NextResponse.json({ log: await gitQuickStash(root) });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message: string };
    return NextResponse.json({ error: e.stderr || e.message }, { status });
  }
}
