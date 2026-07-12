// FR-3.2.1 — Source Control Panel data source.
import { NextRequest, NextResponse } from "next/server";
import { gitStatus } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root");
  if (!root) return NextResponse.json({ error: "root required" }, { status: 400 });
  try {
    return NextResponse.json({ files: await gitStatus(root) });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
