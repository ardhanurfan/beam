// Custom fullstack server (PRD Section 2.2):
// one Node process serving Next.js (UI + API routes) and the WebSocket
// upgrade handler on the same localhost port. cloudflared points here.

import { createServer } from "node:http";
import next from "next";
import { loadEnvConfig } from "@next/env";
import { createWsServer } from "./ws-server";

const dev = process.env.NODE_ENV !== "production";
// Load .env files up front — with a custom server, Next only loads them
// during prepare(), which is too late for reading PORT below.
loadEnvConfig(process.cwd(), dev);

const hostname = "127.0.0.1"; // localhost-only; exposure happens via Cloudflare Tunnel
const port = Number(process.env.PORT ?? 2424);

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const handleNextUpgrade = app.getUpgradeHandler();

  const { handleUpgrade } = createWsServer();

  const server = createServer((req, res) => handle(req, res));

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws") {
      handleUpgrade(req, socket, head);
    } else {
      // Next.js HMR websocket in dev; otherwise Next closes it.
      handleNextUpgrade(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`▲ Beam ready on http://${hostname}:${port}`);
    console.log(`  WS endpoint: ws://${hostname}:${port}/ws (WSS via Cloudflare Tunnel)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
