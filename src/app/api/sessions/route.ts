// Session registry over REST (ROADMAP R2): the server is the source of
// truth for live PTY sessions, so a reopened phone can find and reattach
// to every session — including ones orphaned by a killed tab.
import { NextResponse } from "next/server";
import os from "node:os";
import path from "node:path";
import { ptyManager } from "../../../../server/pty-manager";
import type { SessionInfo } from "@/lib/protocol";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions: SessionInfo[] = ptyManager.list().map((s) => ({
    id: s.id,
    label: s.label,
    cwd: s.cwd,
    status: s.status,
    startedAt: s.startedAt,
    attached: s.listeners.size > 0,
  }));
  sessions.sort((a, b) => a.startedAt - b.startedAt);
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  let body: {
    cwd?: string;
    command?: string;
    label?: string;
    cols?: number;
    rows?: number;
    initialInput?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // "~" picks the home directory explicitly (vs. omitting cwd, which
  // defaults to the active workspace root).
  const cwd =
    typeof body.cwd === "string"
      ? body.cwd === "~" || body.cwd.startsWith("~/")
        ? path.join(os.homedir(), body.cwd.slice(1))
        : body.cwd
      : undefined;
  try {
    const s = ptyManager.create({
      cwd,
      command: typeof body.command === "string" ? body.command : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      cols: typeof body.cols === "number" ? body.cols : undefined,
      rows: typeof body.rows === "number" ? body.rows : undefined,
      initialInput:
        typeof body.initialInput === "string" ? body.initialInput : undefined,
    });
    const info: SessionInfo = {
      id: s.id,
      label: s.label,
      cwd: s.cwd,
      status: s.status,
      startedAt: s.startedAt,
      attached: false,
    };
    return NextResponse.json({ session: info });
  } catch (err) {
    console.error("PTY spawn failed:", err);
    return NextResponse.json({ error: "PTY spawn failed" }, { status: 500 });
  }
}
