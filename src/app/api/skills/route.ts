// List skills/subagents/prompts for one agent (global + project scopes).
import { NextRequest, NextResponse } from "next/server";
import { listSkills } from "@/lib/server/agents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get("agent");
  if (!agent) return NextResponse.json({ error: "agent required" }, { status: 400 });
  return NextResponse.json({ skills: await listSkills(agent) });
}
