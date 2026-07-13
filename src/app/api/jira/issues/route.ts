// Jira issue list for the Tasks tab. Returns {enabled:false} when the
// JIRA_* env vars are absent — the client hides the Jira subtab entirely.
import { NextResponse } from "next/server";
import { jiraConfig, listMyIssues } from "@/lib/server/jira";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = jiraConfig();
  if (!cfg) return NextResponse.json({ enabled: false, issues: [] });
  try {
    return NextResponse.json({
      enabled: true,
      baseUrl: cfg.baseUrl,
      issues: await listMyIssues(cfg),
    });
  } catch (err) {
    return NextResponse.json(
      { enabled: true, error: (err as Error).message },
      { status: 502 }
    );
  }
}
