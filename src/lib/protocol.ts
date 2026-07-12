// Shared WebSocket envelope protocol (PRD Section 2.3)
// Every frame is a structured JSON envelope, never a raw string.

export type FrameType =
  | "pty_stdout"
  | "pty_stdin"
  /** Raw key bytes (Esc, Ctrl+C, arrows) — written verbatim to the PTY. */
  | "pty_stdin_raw"
  /** Terminal geometry from the client: payload {cols, rows}. */
  | "resize"
  | "heartbeat"
  | "resync"
  | "session_state";

export interface Envelope<T = unknown> {
  type: FrameType;
  sessionId: string;
  /** Monotonic per-session sequence number. Mandatory on pty_stdout. */
  seq: number;
  timestamp: number;
  payload: T;
  /** Set by server when the ring buffer could not cover a resync gap. */
  truncated?: boolean;
}

// ---- Resync payloads (PRD Section 4) ----

export interface ResyncRequestPayload {
  lastKnownSeq: number;
}

export interface ResyncResponsePayload {
  /** Frames replayed after this response follow individually; this is the header. */
  fromSeq: number;
  toSeq: number;
}

export interface SessionStatePayload {
  status: "active" | "dormant" | "terminated";
  label: string;
  cwd: string;
  startedAt: number;
}

// ---- Session metadata over REST (/api/sessions, ROADMAP R2) ----

export interface SessionInfo {
  id: string;
  label: string;
  cwd: string;
  status: "active" | "dormant";
  startedAt: number;
  /** True when at least one client is currently attached. */
  attached: boolean;
}

export function makeEnvelope<T>(
  type: FrameType,
  sessionId: string,
  seq: number,
  payload: T,
  truncated?: boolean
): Envelope<T> {
  return { type, sessionId, seq, timestamp: Date.now(), payload, ...(truncated ? { truncated } : {}) };
}
