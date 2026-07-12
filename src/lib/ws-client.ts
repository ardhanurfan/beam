"use client";

// Session hub (ROADMAP R2): the server's /api/sessions registry is the
// source of truth. On boot the hub reattaches to every live PTY session —
// including ones orphaned by a killed tab or another device — and holds one
// WebSocket per session. Each connection keeps the original envelope
// protocol: heartbeat pong, auto-reconnect with backoff, and resync via
// lastKnownSeq (PRD 2.3 & 4).

import {
  makeEnvelope,
  type Envelope,
  type SessionInfo,
  type SessionStatePayload,
} from "@/lib/protocol";
import { useAppStore, type SessionMeta } from "@/store/app-store";

const ACTIVE_KEY = "mmc.activeSessionId";
const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15_000;
const REFRESH_RETRY_MS = 3_000;
const HISTORY_MAX_BYTES = 256 * 1024;

type StdoutListener = (data: string) => void;

export class SessionConnection {
  private ws: WebSocket | null = null;
  private lastKnownSeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** Last measured terminal geometry — flushed once the socket is ready. */
  private pendingResize: { cols: number; rows: number } | null = null;
  private stdoutListeners = new Set<StdoutListener>();
  /** Bounded client-side scrollback, replayed into a (re)mounted terminal. */
  private history: string[] = [];
  private historyBytes = 0;

  constructor(private sessionId: string, private hub: SessionHub) {}

  get id(): string {
    return this.sessionId;
  }

  /** Subscribe to raw terminal output. Prior output is replayed on attach. */
  onStdout(listener: StdoutListener): () => void {
    for (const chunk of this.history) listener(chunk);
    this.stdoutListeners.add(listener);
    return () => this.stdoutListeners.delete(listener);
  }

  send(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(makeEnvelope("pty_stdin", this.sessionId, 0, text)));
  }

  /** Send raw key bytes (Esc, Ctrl+C, Tab, arrows) without a CR. */
  sendRaw(bytes: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify(makeEnvelope("pty_stdin_raw", this.sessionId, 0, bytes))
    );
  }

  /**
   * Propagate the terminal's geometry to the PTY so TUIs render correctly.
   * Cached when the socket isn't ready yet (the first fit() usually races
   * the WS handshake) and flushed on session_state — without this the PTY
   * keeps its spawn-time width and TUIs draw wider than the phone screen.
   */
  sendResize(cols: number, rows: number): void {
    this.pendingResize = { cols, rows };
    this.hub.noteDims(cols, rows);
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify(makeEnvelope("resize", this.sessionId, 0, { cols, rows }))
    );
  }

  connect(): void {
    if (this.disposed) return;
    this.patch({ status: "connecting" });

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?sessionId=${this.sessionId}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.patch({ status: "resyncing" });
    };
    ws.onmessage = (event) => this.handleFrame(JSON.parse(event.data));
    ws.onclose = () => {
      if (this.disposed) return;
      this.patch({ status: "disconnected" });
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  ensureConnected(): void {
    if (this.disposed || this.ws?.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  private patch(patch: Partial<SessionMeta>): void {
    useAppStore.getState().patchSession(this.sessionId, patch);
  }

  private emitStdout(data: string): void {
    this.history.push(data);
    this.historyBytes += data.length;
    while (this.historyBytes > HISTORY_MAX_BYTES && this.history.length > 1) {
      this.historyBytes -= this.history.shift()!.length;
    }
    for (const l of this.stdoutListeners) l(data);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt++,
      RECONNECT_MAX_MS
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleFrame(envelope: Envelope): void {
    switch (envelope.type) {
      case "session_state": {
        const payload = envelope.payload as SessionStatePayload;

        if (payload.status === "terminated") {
          // startedAt === 0 marks the stale-id stub the server sends right
          // before creating a replacement session on this socket (e.g.
          // after a server restart) — the "active" frame that follows
          // carries the new id and is handled below as a rekey.
          if (payload.startedAt === 0) {
            this.lastKnownSeq = 0;
            return;
          }
          // Real exit (user typed `exit`, or the session was killed).
          this.hub.onSessionGone(this.sessionId);
          return;
        }

        if (envelope.sessionId !== this.sessionId) {
          // Rekey: the server replaced our stale session with a fresh one.
          this.lastKnownSeq = 0;
          this.history = [];
          this.historyBytes = 0;
          this.hub.rekey(this, envelope.sessionId, payload);
          this.patch({
            status: "connected",
            label: payload.label,
            cwd: payload.cwd,
            startedAt: payload.startedAt,
          });
          this.flushResize();
          return;
        }

        this.patch({
          label: payload.label,
          cwd: payload.cwd,
          startedAt: payload.startedAt,
        });
        // Ask for everything we missed (all of it, after a fresh page load).
        this.ws?.send(
          JSON.stringify(
            makeEnvelope("resync", this.sessionId, 0, {
              lastKnownSeq: this.lastKnownSeq,
            })
          )
        );
        this.flushResize();
        break;
      }

      case "heartbeat": {
        // Pong back so the server keeps us "active".
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify(makeEnvelope("heartbeat", this.sessionId, 0, "pong"))
          );
        }
        break;
      }

      case "pty_stdout": {
        // Skip duplicates (resync replays overlap with live frames).
        if (envelope.seq <= this.lastKnownSeq) break;
        this.lastKnownSeq = envelope.seq;
        if (envelope.truncated) this.patch({ missedOutput: true });
        this.emitStdout(String(envelope.payload ?? ""));
        break;
      }

      case "resync": {
        if (envelope.truncated) {
          // Gap exceeded the ring buffer: the replay that follows only
          // covers the tail (PRD Section 4).
          const payload = envelope.payload as { fromSeq?: number };
          this.patch({ missedOutput: true });
          this.lastKnownSeq = payload.fromSeq ?? 0;
        }
        this.patch({ status: "connected" });
        break;
      }
    }
  }

  private flushResize(): void {
    if (this.pendingResize) {
      this.sendResize(this.pendingResize.cols, this.pendingResize.rows);
    }
  }

  /** @internal Hub-only: update the id after a server-side rekey. */
  _setId(id: string): void {
    this.sessionId = id;
  }
}

class SessionHub {
  private conns = new Map<string, SessionConnection>();
  private started = false;
  /** Last terminal geometry measured on this device (any session). */
  private lastDims: { cols: number; rows: number } | null = null;

  /** @internal Called by connections whenever a pane measures itself. */
  noteDims(cols: number, rows: number): void {
    this.lastDims = { cols, rows };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // Reconnect eagerly when the app returns to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.ensureAll();
    });
    window.addEventListener("online", () => this.ensureAll());
    void this.refresh();
  }

  get(id: string): SessionConnection | undefined {
    return this.conns.get(id);
  }

  active(): SessionConnection | undefined {
    const id = useAppStore.getState().activeSessionId;
    return id ? this.conns.get(id) : undefined;
  }

  setActive(id: string): void {
    useAppStore.getState().setActiveSession(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }

  /** Spawn a new PTY session on the laptop and attach to it. */
  async create(opts: {
    cwd?: string;
    command?: string;
    label?: string;
  } = {}): Promise<string | null> {
    try {
      // Spawn at this device's terminal size so TUIs draw correctly from
      // their very first frame (before the resize handshake completes).
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts, ...(this.lastDims ?? {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      this.adopt(d.session as SessionInfo);
      this.setActive(d.session.id);
      return d.session.id as string;
    } catch (err) {
      console.error("session create failed:", err);
      return null;
    }
  }

  /** Kill a session's PTY on the laptop (destructive, caller confirms). */
  async kill(id: string): Promise<void> {
    try {
      await fetch("/api/sessions/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, confirm: true }),
      });
    } catch {
      /* connection hiccup — the WS close below still detaches locally */
    }
    this.onSessionGone(id);
  }

  /** A session no longer exists server-side: drop it, never leave zero tabs. */
  onSessionGone(id: string): void {
    this.conns.get(id)?.dispose();
    this.conns.delete(id);
    const store = useAppStore.getState();
    store.removeSession(id);
    const remaining = useAppStore.getState().sessions;
    if (remaining.length === 0) {
      void this.create();
    } else if (useAppStore.getState().activeSessionId === null) {
      this.setActive(remaining[0].id);
    }
  }

  /** @internal The server swapped a stale id for a fresh session on the same socket. */
  rekey(conn: SessionConnection, newId: string, payload: SessionStatePayload): void {
    const oldId = conn.id;
    this.conns.delete(oldId);
    conn._setId(newId);
    this.conns.set(newId, conn);
    const store = useAppStore.getState();
    store.removeSession(oldId);
    store.upsertSession({
      id: newId,
      label: payload.label,
      cwd: payload.cwd,
      startedAt: payload.startedAt,
      status: "connected",
      missedOutput: false,
    });
    if (localStorage.getItem(ACTIVE_KEY) === oldId) this.setActive(newId);
    if (useAppStore.getState().activeSessionId === null) this.setActive(newId);
  }

  private adopt(info: SessionInfo): void {
    if (this.conns.has(info.id)) return;
    useAppStore.getState().upsertSession({
      id: info.id,
      label: info.label,
      cwd: info.cwd,
      startedAt: info.startedAt,
      status: "connecting",
      missedOutput: false,
    });
    const conn = new SessionConnection(info.id, this);
    this.conns.set(info.id, conn);
    conn.connect();
  }

  private async refresh(): Promise<void> {
    let sessions: SessionInfo[];
    try {
      const r = await fetch("/api/sessions");
      const d = await r.json();
      sessions = d.sessions ?? [];
    } catch {
      setTimeout(() => void this.refresh(), REFRESH_RETRY_MS);
      return;
    }
    if (sessions.length === 0) {
      await this.create();
      return;
    }
    for (const s of sessions) this.adopt(s);
    const saved = localStorage.getItem(ACTIVE_KEY);
    const active = sessions.some((s) => s.id === saved) ? saved! : sessions[0].id;
    this.setActive(active);
  }

  private ensureAll(): void {
    for (const conn of this.conns.values()) conn.ensureConnected();
  }
}

// Module-level singleton (survives React strict-mode remounts).
export const sessionHub = new SessionHub();
