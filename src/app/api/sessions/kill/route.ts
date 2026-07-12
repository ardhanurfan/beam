// Kill a PTY session (ROADMAP R2). Destructive — requires an explicit
// confirm flag, same contract as the other destructive endpoints.
import { NextResponse } from "next/server";
import { ptyManager } from "../../../../../server/pty-manager";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { id?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.id || body.confirm !== true) {
    return NextResponse.json(
      { error: "id and confirm:true are required" },
      { status: 400 }
    );
  }
  const killed = ptyManager.terminate(body.id);
  if (!killed) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
