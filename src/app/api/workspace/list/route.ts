// FR-3.4.1 — Workspace File Picker: scan common locations for *.code-workspace.
import { NextResponse } from "next/server";
import path from "node:path";
import { findWorkspaceFiles } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const files = await findWorkspaceFiles();
  return NextResponse.json({
    workspaces: files.map((file) => ({
      file,
      name: path.basename(file, ".code-workspace"),
    })),
  });
}
