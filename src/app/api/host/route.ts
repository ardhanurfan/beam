// Host & network info for the connection sheet: which laptop this UI is
// projecting, and over which local network interface.
import { NextResponse } from "next/server";
import os from "node:os";

export const dynamic = "force-dynamic";

export async function GET() {
  const nets = os.networkInterfaces();
  const networks: Array<{ iface: string; address: string }> = [];
  for (const [iface, addrs] of Object.entries(nets)) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) {
        networks.push({ iface, address: a.address });
      }
    }
  }
  return NextResponse.json({
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    user: os.userInfo().username,
    networks,
    uptimeSec: Math.floor(os.uptime()),
  });
}
