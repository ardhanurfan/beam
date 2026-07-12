// Delete a skill/subagent/prompt file (guarded, confirm-gated).
import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, SkillAccessError } from "@/lib/server/agents";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { path?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.path || body.confirm !== true) {
    return NextResponse.json(
      { error: "path and confirm:true are required" },
      { status: 400 }
    );
  }
  try {
    const log = await deleteSkill(body.path);
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    const status = err instanceof SkillAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
