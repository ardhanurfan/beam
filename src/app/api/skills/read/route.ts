// Read a skill file (guarded to agent skill directories).
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { assertSkillPath, SkillAccessError } from "@/lib/server/agents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("path");
  if (!requested) return NextResponse.json({ error: "path required" }, { status: 400 });
  try {
    const file = await assertSkillPath(requested, "read");
    const content = await fs.readFile(file, "utf8").catch(() => null);
    return NextResponse.json({ content: content ?? "", exists: content !== null });
  } catch (err) {
    const status = err instanceof SkillAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
