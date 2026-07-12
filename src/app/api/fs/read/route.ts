// Read a file (viewer + diff preview base for Apply-to-File, FR-3.1.5).
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { assertInsideWorkspace, WorkspaceAccessError } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

const MAX_READ_BYTES = 2 * 1024 * 1024; // mobile viewer cap

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("path");
  if (!requested) return NextResponse.json({ error: "path required" }, { status: 400 });
  try {
    const file = assertInsideWorkspace(requested);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return NextResponse.json({ content: "", exists: false });
    if (stat.size > MAX_READ_BYTES) {
      return NextResponse.json({ error: "file too large for mobile viewer" }, { status: 413 });
    }
    const content = await fs.readFile(file, "utf8");
    return NextResponse.json({ content, exists: true });
  } catch (err) {
    const status = err instanceof WorkspaceAccessError ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
