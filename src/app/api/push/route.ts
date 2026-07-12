// Web Push subscription management (ROADMAP R1).
import { NextResponse } from "next/server";
import { pushManager } from "../../../../server/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    publicKey: pushManager.getPublicKey(),
    subscriptions: pushManager.subscriptionCount(),
  });
}

export async function POST(req: Request) {
  let body: { subscription?: { endpoint?: string; keys?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys) {
    return NextResponse.json({ error: "subscription is required" }, { status: 400 });
  }
  pushManager.addSubscription(sub as Parameters<typeof pushManager.addSubscription>[0]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }
  pushManager.removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
