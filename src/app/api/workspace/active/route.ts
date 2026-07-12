import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getActiveWorkspace());
}
