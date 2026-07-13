// Jira issue detail: full fields + description converted ADF → markdown.
import { NextRequest, NextResponse } from "next/server";
import { jiraConfig, getIssue } from "@/lib/server/jira";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const cfg = jiraConfig();
  if (!cfg) return NextResponse.json({ error: "Jira not configured" }, { status: 404 });
  try {
    return NextResponse.json({ issue: await getIssue(cfg, key) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
