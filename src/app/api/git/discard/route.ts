// Per-file discard (VSCode-style). Destructive for that single file —
// requires an explicit confirm flag from the dialog.
import { NextRequest, NextResponse } from "next/server";
import { gitDiscardFile } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { root?: string; path?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.root || !body.path || body.confirm !== true) {
    return NextResponse.json(
      { error: "root, path and confirm:true are required" },
      { status: 400 }
    );
  }
  try {
    const log = await gitDiscardFile(body.root, body.path);
    return NextResponse.json({ log });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message?: string };
    return NextResponse.json({ error: e.stderr || e.message || "git failed" }, { status });
  }
}
