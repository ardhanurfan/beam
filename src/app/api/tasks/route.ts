// Custom task list & create (Tasks tab). Files live in ~/.beam/tasks.
import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask, TaskAccessError } from "@/lib/server/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tasks: await listTasks() });
}

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ task: await createTask(body.name) });
  } catch (err) {
    const status = err instanceof TaskAccessError ? 409 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
