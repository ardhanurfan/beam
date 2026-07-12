// FR-3.2.2 — per-file unified diff, parsed client-side into stacked hunks.
import { NextRequest, NextResponse } from "next/server";
import { gitDiff } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root");
  const file = req.nextUrl.searchParams.get("file");
  if (!root || !file) {
    return NextResponse.json({ error: "root and file required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ diff: await gitDiff(root, file) });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
