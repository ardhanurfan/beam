// Branch awareness for the Source Control panel: current branch,
// local branch list, ahead/behind upstream.
import { NextRequest, NextResponse } from "next/server";
import { gitBranchInfo } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root");
  if (!root) return NextResponse.json({ error: "root required" }, { status: 400 });
  try {
    return NextResponse.json(await gitBranchInfo(root));
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message: string };
    return NextResponse.json({ error: e.stderr || e.message }, { status });
  }
}
