"use client";

// Terminal tab: a REAL terminal (xterm.js) per session — Claude Code's TUI
// renders exactly as it does on the laptop — with a session tab strip on
// top (ROADMAP R2) and a chat-style prompt bar + shortcut-key row at the
// bottom. Every pane stays mounted (CSS-hidden) so scrollback survives
// switching sessions.

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ArrowDown, ArrowUp, Folder, Home, Mic, Plus, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { sessionHub } from "@/lib/ws-client";
import Sheet from "@/components/sheet";
import TapButton from "@/components/tap-button";
import { useAppStore, useActiveSession } from "@/store/app-store";
import { useVoiceInput } from "@/lib/use-voice-input";

// Shortcut keys the mobile keyboard lacks (FR-3.3.4). Sent as raw PTY bytes.
const KEYS: Array<{ label: string; seq: string }> = [
  { label: "Esc", seq: "\x1b" },
  { label: "Tab", seq: "\t" },
  { label: "⇧Tab", seq: "\x1b[Z" },
  { label: "Ctrl C", seq: "\x03" },
  { label: "Ctrl D", seq: "\x04" },
  { label: "Ctrl R", seq: "\x12" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "←", seq: "\x1b[D" },
  { label: "→", seq: "\x1b[C" },
  { label: "Enter", seq: "\r" },
];

// Terminal font size bounds. Changing size refits xterm AND resizes the
// PTY, so the TUI reflows to the new column count instead of clipping.
const FONT_KEY = "beam:term-font-size";
const FONT_MIN = 9;
const FONT_MAX = 18;
const FONT_DEFAULT = 12;

/** One xterm instance bound to one session connection. */
function TerminalPane({
  sessionId,
  hidden,
  fontSize,
}: {
  sessionId: string;
  hidden: boolean;
  fontSize: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const doFitRef = useRef<() => void>(() => {});
  // Font size changes are applied to the live terminal in their own effect;
  // the ref keeps the create-once effect below off the fontSize dependency.
  const fontSizeRef = useRef(fontSize);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    doFitRef.current();
  }, [fontSize]);

  useEffect(() => {
    const host = hostRef.current;
    const conn = sessionHub.get(sessionId);
    if (!host || !conn) return;
    let disposed = false;

    const term = new Terminal({
      fontSize: fontSizeRef.current,
      fontFamily: "var(--font-mono), Menlo, monospace",
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: {
        background: "#0d0c1d",
        foreground: "#e8e6f5",
        cursor: "#d8f878",
        cursorAccent: "#0d0c1d",
        selectionBackground: "#3d3766",
        black: "#1a1830",
        brightBlack: "#5c5680",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;

    // "At bottom" = viewport is following live output; drives the
    // jump-to-latest button while reading scrollback.
    const updateAtBottom = () => {
      const buf = term.buffer.active;
      setAtBottom(buf.viewportY >= buf.baseY);
    };

    // Typing directly in the terminal also works (hardware keyboards).
    const dataSub = term.onData((d) => conn.sendRaw(d));
    const unsubStdout = conn.onStdout((chunk) => term.write(chunk, updateAtBottom));
    const scrollSub = term.onScroll(updateAtBottom);

    // Keep the PTY size in sync with the rendered terminal. Skip while the
    // pane is hidden (display:none → zero size would corrupt the geometry);
    // the ResizeObserver fires again when the pane becomes visible.
    const doFit = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      fit.fit();
      conn.sendResize(term.cols, term.rows);
    };
    doFit();
    doFitRef.current = doFit;
    const ro = new ResizeObserver(doFit);
    ro.observe(host);

    // The first fit above may have measured a fallback font: until the mono
    // webfont loads, cell width is wrong, so the PTY gets the wrong column
    // count and the TUI hard-wraps at the wrong width (broken fragments in
    // scrollback). Once fonts are in, force xterm to re-measure and refit.
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      const size = term.options.fontSize ?? fontSizeRef.current;
      term.options.fontSize = size + 1; // toggle forces char re-measure
      term.options.fontSize = size;
      doFit();
    });

    // xterm.js only scrolls on wheel events — add touch scrolling for
    // mobile: drag gestures scroll the scrollback buffer line by line.
    let touchY = 0;
    let touchCarry = 0; // sub-line remainder so slow drags still scroll
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
      touchCarry = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const cellHeight = Math.max(8, host.clientHeight / term.rows);
      const delta = (touchY - y) / cellHeight + touchCarry;
      const lines = Math.trunc(delta);
      touchCarry = delta - lines;
      if (lines !== 0) {
        term.scrollLines(lines);
        updateAtBottom();
      }
      touchY = y;
      e.preventDefault(); // keep the page itself from scrolling/bouncing
    };
    // Touch is read-and-scroll only: suppress the synthetic click that
    // would focus xterm's hidden textarea and summon the virtual keyboard.
    // Mobile input goes through the prompt bar and shortcut keys; desktop
    // mouse clicks (hardware keyboards) are unaffected.
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
    };
    host.addEventListener("touchstart", onTouchStart, { passive: true });
    host.addEventListener("touchmove", onTouchMove, { passive: false });
    host.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      disposed = true;
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      ro.disconnect();
      dataSub.dispose();
      scrollSub.dispose();
      unsubStdout();
      term.dispose();
      termRef.current = null;
      doFitRef.current = () => {};
    };
  }, [sessionId]);

  return (
    <div className={hidden ? "hidden" : "relative h-full min-h-0"}>
      <div ref={hostRef} className="h-full min-h-0 px-2 pt-2" />
      {/* Jump back to live output after scrolling up through scrollback */}
      {!atBottom && (
        <button
          onClick={() => {
            termRef.current?.scrollToBottom();
            setAtBottom(true);
          }}
          aria-label="Jump to latest output"
          className="absolute bottom-3 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur active:bg-white/30"
        >
          <ArrowDown size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export default function TerminalView() {
  const sessions = useAppStore((s) => s.sessions);
  const active = useActiveSession();
  const roots = useAppStore((s) => s.roots);
  const [input, setInput] = useState("");
  const [killTarget, setKillTarget] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Saved font size; nothing in the SSR markup depends on it, so reading
  // localStorage in the initializer is hydration-safe.
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return FONT_DEFAULT;
    const saved = Number(window.localStorage.getItem(FONT_KEY));
    return saved >= FONT_MIN && saved <= FONT_MAX ? saved : FONT_DEFAULT;
  });

  function bumpFont(delta: number) {
    setFontSize((s) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, s + delta));
      localStorage.setItem(FONT_KEY, String(next));
      return next;
    });
  }

  const voiceBase = useRef("");
  const onTranscript = useCallback((text: string, final: boolean) => {
    setInput(voiceBase.current + text);
    if (final) voiceBase.current = "";
  }, []);
  const voice = useVoiceInput(onTranscript);

  function send() {
    const text = input.trim();
    if (!text) return;
    sessionHub.active()?.send(text);
    setInput("");
  }

  const killSession = sessions.find((s) => s.id === killTarget);

  return (
    <div className="flex h-full flex-col bg-[#0d0c1d]">
      {/* Session tab strip (ROADMAP R2) */}
      <div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pt-2">
        {sessions.map((s) => {
          const isActive = s.id === active?.id;
          return (
            <button
              key={s.id}
              onClick={() =>
                isActive ? setKillTarget(s.id) : sessionHub.setActive(s.id)
              }
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium ${
                isActive ? "bg-block-lime text-black" : "bg-white/10 text-white/80"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  s.status === "connected"
                    ? isActive
                      ? "bg-black/70"
                      : "bg-success"
                    : s.status === "disconnected"
                    ? "bg-danger"
                    : "animate-pulse bg-block-coral"
                }`}
              />
              <span className="max-w-32 truncate">{s.label}</span>
              {isActive && <X size={12} strokeWidth={2.5} className="opacity-60" />}
            </button>
          );
        })}
        <button
          onClick={() => setPickerOpen(true)}
          aria-label="New session"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/25"
        >
          <Plus size={15} strokeWidth={2.5} />
        </button>
      </div>

      {/* Terminal panes — all mounted, one visible */}
      <div className="min-h-0 flex-1">
        {sessions.map((s) => (
          <TerminalPane
            key={s.id}
            sessionId={s.id}
            hidden={s.id !== active?.id}
            fontSize={fontSize}
          />
        ))}
      </div>

      {/* Shortcut keys */}
      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2">
        {KEYS.map((k) => (
          <TapButton
            key={k.label}
            onTap={() => sessionHub.active()?.sendRaw(k.seq)}
            className="h-8 shrink-0 rounded-md bg-white/10 px-3 font-mono text-[12px] font-medium text-white/90 active:bg-white/25"
          >
            {k.label}
          </TapButton>
        ))}
        <span className="my-1 w-px shrink-0 bg-white/15" />
        <TapButton
          onTap={() => bumpFont(-1)}
          aria-label="Smaller terminal text"
          className="h-8 shrink-0 rounded-md bg-white/10 px-3 font-mono text-[12px] font-medium text-white/90 active:bg-white/25"
        >
          A−
        </TapButton>
        <TapButton
          onTap={() => bumpFont(1)}
          aria-label="Larger terminal text"
          className="h-8 shrink-0 rounded-md bg-white/10 px-3 font-mono text-[12px] font-medium text-white/90 active:bg-white/25"
        >
          A+
        </TapButton>
      </div>

      {/* Chat-style prompt bar (bottom) */}
      <div className="shrink-0 px-3 pb-3">
        {voice.error && (
          <p className="mb-1.5 text-[12px] text-block-coral">{voice.error}</p>
        )}
        <div className="flex items-end gap-2 rounded-[22px] bg-white/10 p-1.5 pl-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              active?.status === "connected" ? "Message your agent…" : "Reconnecting…"
            }
            className="max-h-28 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] leading-snug text-white placeholder:text-white/40 focus:outline-none"
          />
          {voice.supported && (
            <button
              onClick={() => {
                if (!voice.listening) {
                  voiceBase.current = input ? input.replace(/\s*$/, " ") : "";
                }
                voice.start();
              }}
              aria-label={voice.listening ? "Stop dictation" : "Dictate prompt"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                voice.listening
                  ? "animate-pulse bg-accent-magenta text-white"
                  : "text-white/70 active:bg-white/15"
              }`}
            >
              <Mic size={18} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={send}
            disabled={!input.trim() || active?.status !== "connected"}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-block-lime text-black disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* New-session root picker: a session always opens somewhere the
          user chose — a workspace root or the home directory. */}
      {pickerOpen && (
        <Sheet title="New session in…" onClose={() => setPickerOpen(false)}>
          <ul className="space-y-2">
              {roots.map((r) => (
                <li key={r.path}>
                  <button
                    onClick={() => {
                      void sessionHub.create({ cwd: r.path, label: r.name });
                      setPickerOpen(false);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-left"
                  >
                    <Folder size={18} className="shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {r.name}
                      </span>
                      <span className="block truncate font-mono text-[12px] opacity-55">
                        {r.path}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  onClick={() => {
                    void sessionHub.create({ cwd: "~", label: "home" });
                    setPickerOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-left"
                >
                  <Home size={18} className="shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      Home directory
                    </span>
                    <span className="block truncate font-mono text-[12px] opacity-55">
                      ~
                    </span>
                  </span>
                </button>
              </li>
            </ul>
        </Sheet>
      )}

      {/* Kill-session confirmation (destructive) */}
      {killSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setKillTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] bg-canvas p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16px] font-semibold">End “{killSession.label}”?</p>
            <p className="mt-2 text-[14px] opacity-70">
              This kills the shell and anything running inside it on the laptop.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setKillTarget(null)}
                className="rounded-pill border border-hairline px-5 py-2.5 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void sessionHub.kill(killSession.id);
                  setKillTarget(null);
                }}
                className="rounded-pill bg-danger px-5 py-2.5 text-[14px] font-medium text-white"
              >
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
