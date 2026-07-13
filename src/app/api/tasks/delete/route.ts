// Delete a custom task file (guarded, confirm-gated).
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { assertTaskPath, TaskAccessError } from "@/lib/server/tasks";

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
    const file = assertTaskPath(body.path);
    await fs.rm(file, { force: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof TaskAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
