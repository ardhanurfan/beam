// Per-session activity monitor (ROADMAP R1).
//
// Watches the raw PTY stdout stream and detects the moment a burst of
// output goes quiet — TUI agents (Claude Code) redraw their spinner
// continuously while working, so a genuinely idle stream means the agent
// finished or is waiting for the user. The event feeds push notifications
// for sessions nobody is watching.

const IDLE_CLOSE_MS = 5_000; // quiet this long => the burst is over
const MIN_BURST_BYTES = 512; // ignore keystroke echoes / prompt redraws
const TAIL_MAX_CHARS = 2_000;

// CSI / OSC / single-char escape sequences.
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export function stripAnsi(input: string): string {
  return input
    .replace(ANSI_RE, "")
    .replace(/\r\n/g, "\n")
    // Carriage-return overwrites (progress bars/spinners): keep the last write.
    .replace(/^.*\r(?!\n)/gm, "")
    .replace(CONTROL_RE, "");
}

// Signals that the stream is waiting on the user rather than merely done:
// agent confirmation prompts ("Do you want…", ❯-menus, y/n) or a shell
// prompt at the end of the stream.
const WAITING_RE =
  /(?:do you want|proceed\?|\(y\/n\)|\[y\/n\]|press enter|esc to interrupt|❯)/i;
const PROMPT_TAIL_RE = /(?:^|\n)[^\n]*[$%❯>]\s?$/;

export type ActivityEvent = "waiting_input" | "went_idle";

export class ActivityMonitor {
  private tail = "";
  private burstBytes = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private onEvent: (event: ActivityEvent) => void) {}

  /** Feed a raw PTY stdout chunk (unbatched, as delivered by the PTY buffer). */
  feed(chunk: string): void {
    this.burstBytes += Buffer.byteLength(chunk);
    this.tail = (this.tail + chunk).slice(-TAIL_MAX_CHARS);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.closeBurst(), IDLE_CLOSE_MS);
    this.idleTimer.unref?.();
  }

  /** User input re-arms the monitor: they are clearly present and active. */
  noteInput(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.burstBytes = 0;
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private closeBurst(): void {
    this.idleTimer = null;
    const bytes = this.burstBytes;
    this.burstBytes = 0;
    if (bytes < MIN_BURST_BYTES) return; // echo noise, not real work
    const text = stripAnsi(this.tail);
    const lastLines = text.split("\n").slice(-8).join("\n");
    const waiting = WAITING_RE.test(lastLines) || PROMPT_TAIL_RE.test(text);
    this.onEvent(waiting ? "waiting_input" : "went_idle");
  }
}
