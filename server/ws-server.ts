// WebSocket server (PRD Section 2.3) — envelope protocol over WSS.
// TLS termination happens at the Cloudflare edge; behind the tunnel the
// server never listens on a public interface.

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { ptyManager } from "./pty-manager";
import {
  makeEnvelope,
  type Envelope,
  type ResyncRequestPayload,
  type SessionStatePayload,
} from "../src/lib/protocol";

const HEARTBEAT_INTERVAL_MS = 15_000;
const DORMANT_AFTER_MS = 45_000;

interface ClientState {
  sessionId: string;
  lastPongAt: number;
}

export function createWsServer() {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientState>();

  // Heartbeat: ping every 15s; no pong within 45s => session dormant
  // (PTY stays alive — status only, PRD Section 4).
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [ws, state] of clients) {
      if (now - state.lastPongAt > DORMANT_AFTER_MS) {
        ptyManager.markDormant(state.sessionId);
        ws.terminate(); // client will resync on reconnect
        continue;
      }
      ws.send(
        JSON.stringify(makeEnvelope("heartbeat", state.sessionId, 0, "ping"))
      );
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requestedId = url.searchParams.get("sessionId");
    const cwd = url.searchParams.get("cwd") ?? undefined;

    // Validate sessionId per connection (defense in depth, PRD 2.4):
    // an unknown sessionId never attaches to another session's PTY.
    let session = requestedId ? ptyManager.get(requestedId) : undefined;
    if (requestedId && !session) {
      ws.send(
        JSON.stringify(
          makeEnvelope<SessionStatePayload>("session_state", requestedId, 0, {
            status: "terminated",
            label: "",
            cwd: "",
            startedAt: 0,
          })
        )
      );
      // Fall through: create a fresh session instead of hijacking.
      session = undefined;
    }
    if (!session) {
      try {
        session = ptyManager.create({ cwd });
      } catch (err) {
        console.error("PTY spawn failed:", err);
        ws.close(1011, "pty spawn failed");
        return;
      }
    }

    const sessionId = session.id;
    clients.set(ws, { sessionId, lastPongAt: Date.now() });

    const send = (envelope: Envelope) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(envelope));
    };

    send(
      makeEnvelope<SessionStatePayload>("session_state", sessionId, session.lastSeq, {
        status: "active",
        label: session.label,
        cwd: session.cwd,
        startedAt: session.startedAt,
      })
    );

    const detach = ptyManager.attach(sessionId, {
      onStdout: (chunk, truncated) =>
        send({
          type: "pty_stdout",
          sessionId,
          seq: chunk.seq,
          timestamp: chunk.timestamp,
          payload: chunk.data,
          ...(truncated ? { truncated } : {}),
        }),
      onExit: (code) =>
        send(
          makeEnvelope<SessionStatePayload>("session_state", sessionId, 0, {
            status: "terminated",
            label: session.label,
            cwd: session.cwd,
            startedAt: session.startedAt,
          })
        ) ?? void code,
    });

    ws.on("message", (raw) => {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        return; // non-envelope frames are ignored by design
      }
      // Reject frames addressed to a different session (PRD 2.4).
      if (envelope.sessionId !== sessionId) return;

      const state = clients.get(ws);
      if (state) state.lastPongAt = Date.now();
      ptyManager.markSeen(sessionId);

      switch (envelope.type) {
        case "pty_stdin": {
          const text = String(envelope.payload ?? "");
          ptyManager.write(sessionId, text.endsWith("\r") ? text : text + "\r");
          break;
        }
        case "pty_stdin_raw": {
          // Control keys from the floating toolbar (FR-3.3.4): verbatim
          // bytes, no CR appended.
          ptyManager.write(sessionId, String(envelope.payload ?? ""));
          break;
        }
        case "resize": {
          const { cols, rows } = envelope.payload as { cols: number; rows: number };
          if (Number.isFinite(cols) && Number.isFinite(rows)) {
            ptyManager.resize(sessionId, cols, rows);
          }
          break;
        }
        case "heartbeat":
          break; // pong — lastPongAt already refreshed above
        case "resync": {
          const { lastKnownSeq } = envelope.payload as ResyncRequestPayload;
          const result = ptyManager.resync(sessionId, lastKnownSeq ?? 0);
          if (!result) break;
          if (result.ok) {
            send(
              makeEnvelope("resync", sessionId, session.lastSeq, {
                fromSeq: lastKnownSeq,
                toSeq: session.lastSeq,
              })
            );
            for (const chunk of result.chunks) {
              send({
                type: "pty_stdout",
                sessionId,
                seq: chunk.seq,
                timestamp: chunk.timestamp,
                payload: chunk.data,
              });
            }
          } else {
            // Gap exceeds buffer: send truncated flag, never the full
            // history (PRD Section 4). The terminal still gets whatever
            // the ring buffer holds so the screen isn't blank.
            send({
              type: "resync",
              sessionId,
              seq: result.lastSeq,
              timestamp: Date.now(),
              truncated: true,
              payload: { fromSeq: lastKnownSeq, toSeq: result.lastSeq },
            });
            const s = ptyManager.get(sessionId);
            for (const chunk of s?.buffer ?? []) {
              send({
                type: "pty_stdout",
                sessionId,
                seq: chunk.seq,
                timestamp: chunk.timestamp,
                payload: chunk.data,
              });
            }
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      detach?.(); // DETACH, not kill — PTY keeps running
    });
    ws.on("error", () => ws.close());
  });

  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }

  return { wss, handleUpgrade };
}
