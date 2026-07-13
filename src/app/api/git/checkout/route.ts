// Switch to (or create) a branch. Non-destructive: plain `git checkout`
// refuses when local changes would be clobbered — never forced.
import { NextRequest, NextResponse } from "next/server";
import { gitCheckout } from "@/lib/server/git";
import { WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { root?: string; branch?: string; create?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.root || !body.branch) {
    return NextResponse.json({ error: "root and branch required" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      log: await gitCheckout(body.root, body.branch, body.create === true),
    });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    const e = err as { stderr?: string; message: string };
    return NextResponse.json({ error: e.stderr || e.message }, { status });
  }
}
