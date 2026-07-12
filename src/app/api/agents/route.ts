// Detect installed AI coding agents (binary presence + version).
import { NextResponse } from "next/server";
import { detectAgents } from "@/lib/server/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ agents: await detectAgents() });
}
