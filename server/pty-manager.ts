// PTY session manager (PRD Section 4 — Persistence & Daemon State Management)
//
// Core rule: DETACH, not KILL. A PTY session's lifecycle is independent of
// any WebSocket connection. On disconnect the PTY keeps running; output is
// retained in a per-session ring buffer for resync on reconnect.

import { spawn, type IPty } from "node-pty";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ActivityMonitor } from "./activity-monitor";
import { pushManager } from "./push";
import { getActiveWorkspace } from "../src/lib/server/workspace";

const RING_BUFFER_MAX_BYTES = 256 * 1024; // 256 KB per session (PRD rec.)
const DORMANT_TERMINATE_MS =
  Number(process.env.MMC_IDLE_HOURS ?? 12) * 60 * 60 * 1000; // default 12h
const REAPER_INTERVAL_MS = 10 * 60 * 1000;
const PUSH_COOLDOWN_MS = 60 * 1000; // at most one push per session per minute

export interface BufferedChunk {
  seq: number;
  data: string;
  timestamp: number;
}

export interface PtySession {
  id: string;
  pty: IPty;
  label: string;
  cwd: string;
  startedAt: number;
  lastSeq: number;
  /** Ring buffer of raw stdout chunks, capped at RING_BUFFER_MAX_BYTES. */
  buffer: BufferedChunk[];
  bufferBytes: number;
  /** True when chunks were dropped since the oldest buffered seq. */
  truncated: boolean;
  monitor: ActivityMonitor;
  lastPushAt: number;
  status: "active" | "dormant";
  lastSeenAt: number;
  listeners: Set<SessionListener>;
}

export interface SessionListener {
  onStdout: (chunk: BufferedChunk, truncated: boolean) => void;
  onExit: (code: number) => void;
}

class PtySessionManager {
  private sessions = new Map<string, PtySession>();
  private reaper: NodeJS.Timeout;

  constructor() {
    this.reaper = setInterval(() => this.reapDormant(), REAPER_INTERVAL_MS);
    this.reaper.unref();
  }

  create(
    opts: {
      cwd?: string;
      command?: string;
      label?: string;
      cols?: number;
      rows?: number;
    } = {}
  ): PtySession {
    // Without an explicit cwd, open in the active workspace (first root)
    // so the terminal lands in the project the user is looking at, not ~.
    const cwd = opts.cwd ?? firstWorkspaceRoot() ?? os.homedir();
    // Spawn at the requesting device's terminal size when known — a TUI's
    // first paint (welcome boxes etc.) is unrecoverable scrollback if it
    // happens at the wrong width.
    const cols = Math.max(20, Math.min(500, Math.floor(opts.cols ?? 100)));
    const rows = Math.max(5, Math.min(200, Math.floor(opts.rows ?? 40)));
    const shell =
      opts.command ?? process.env.MMC_SHELL ?? process.env.SHELL ?? "zsh";
    const id = randomUUID();
    const label =
      opts.label ??
      (opts.command ? path.basename(opts.command) : path.basename(cwd) || "shell");

    const pty = spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });

    const session: PtySession = {
      id,
      pty,
      label,
      cwd,
      startedAt: Date.now(),
      lastSeq: 0,
      buffer: [],
      bufferBytes: 0,
      truncated: false,
      monitor: new ActivityMonitor((event) => {
        // Notify only when nobody is watching (ROADMAP R1): an attached
        // client sees the terminal live and needs no push.
        if (session.listeners.size > 0) return;
        const now = Date.now();
        if (now - session.lastPushAt < PUSH_COOLDOWN_MS) return;
        session.lastPushAt = now;
        void pushManager.notifyAll({
          title: session.label,
          body:
            event === "waiting_input"
              ? "The agent is waiting for your input."
              : "Output went quiet — the task likely finished.",
          data: { sessionId: session.id },
        });
      }),
      lastPushAt: 0,
      status: "active",
      lastSeenAt: Date.now(),
      listeners: new Set(),
    };

    pty.onData((data) => {
      const chunk: BufferedChunk = {
        seq: ++session.lastSeq,
        data,
        timestamp: Date.now(),
      };
      this.pushChunk(session, chunk);
      session.monitor.feed(data);
      for (const l of session.listeners) l.onStdout(chunk, false);
    });

    pty.onExit(({ exitCode }) => {
      session.monitor.dispose();
      for (const l of session.listeners) l.onExit(exitCode);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  list(): PtySession[] {
    return [...this.sessions.values()];
  }

  write(id: string, data: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.monitor.noteInput(); // the user is present — re-arm notifications
    s.pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    const c = Math.max(20, Math.min(500, Math.floor(cols)));
    const r = Math.max(5, Math.min(200, Math.floor(rows)));
    try {
      s.pty.resize(c, r);
    } catch {
      /* race with exiting pty — ignore */
    }
  }

  attach(id: string, listener: SessionListener): (() => void) | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    s.listeners.add(listener);
    s.status = "active";
    s.lastSeenAt = Date.now();
    return () => {
      // DETACH: stop delivering output, keep the PTY alive.
      s.listeners.delete(listener);
      if (s.listeners.size === 0) {
        s.status = "dormant";
        s.lastSeenAt = Date.now();
      }
    };
  }

  markSeen(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.lastSeenAt = Date.now();
  }

  markDormant(id: string): void {
    const s = this.sessions.get(id);
    if (s) {
      s.status = "dormant";
      s.lastSeenAt = Date.now();
    }
  }

  /**
   * Resync (PRD Section 4): return the chunks the client missed, or signal
   * truncation when the gap exceeds the ring buffer (the caller then replays
   * whatever the buffer still holds).
   */
  resync(
    id: string,
    lastKnownSeq: number
  ):
    | { ok: true; chunks: BufferedChunk[] }
    | { ok: false; truncated: true; lastSeq: number }
    | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const oldestBuffered = s.buffer[0]?.seq ?? s.lastSeq + 1;
    const gapCovered = lastKnownSeq + 1 >= oldestBuffered || lastKnownSeq >= s.lastSeq;
    if (gapCovered) {
      return { ok: true, chunks: s.buffer.filter((c) => c.seq > lastKnownSeq) };
    }
    return { ok: false, truncated: true, lastSeq: s.lastSeq };
  }

  terminate(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.monitor.dispose();
    s.pty.kill();
    this.sessions.delete(id);
    return true;
  }

  private pushChunk(s: PtySession, chunk: BufferedChunk): void {
    s.buffer.push(chunk);
    s.bufferBytes += Buffer.byteLength(chunk.data);
    // Backpressure / cap: drop-oldest and flag truncated (PRD 2.3).
    while (s.bufferBytes > RING_BUFFER_MAX_BYTES && s.buffer.length > 1) {
      const dropped = s.buffer.shift()!;
      s.bufferBytes -= Buffer.byteLength(dropped.data);
      s.truncated = true;
    }
  }

  private reapDormant(): void {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (s.status === "dormant" && now - s.lastSeenAt > DORMANT_TERMINATE_MS) {
        this.terminate(s.id);
      }
    }
  }
}

function firstWorkspaceRoot(): string | undefined {
  const root = getActiveWorkspace().roots[0]?.path;
  return root && fs.existsSync(root) ? root : undefined;
}

// Singleton across the whole Node process (custom server + Next runtime).
const g = globalThis as unknown as { __mmcPtyManager?: PtySessionManager };
export const ptyManager: PtySessionManager =
  g.__mmcPtyManager ?? (g.__mmcPtyManager = new PtySessionManager());
