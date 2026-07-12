# Product Requirement Document (PRD)

## Beam (Mobile Mission Control) — Visual Bridge for a Local AI Agent

|                               |                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------- |
| **Document version**          | 1.0 (translated to English; originally Indonesian)                            |
| **Date**                      | July 9, 2026                                                                  |
| **Status**                    | Draft — Ready to Execute (Phase 1 / MVP)                                      |
| **Deployment classification** | Self-hosted, local-only, no public cloud assets                               |
| **Core stack**                | Next.js (fullstack) · WebSocket (WSS) · node-pty · Cloudflare Tunnel + Access |

---

## 1. Product Overview & Value Proposition

### 1.1 Product Vision

This product is a **one-way visual bridge** between a _mobile browser_ on a phone and the _host machine_ (laptop) running an AI coding agent (Claude Code CLI). It does not replace the terminal; it **wraps the raw terminal process** (stdin/stdout/stderr) in a UI layer designed for thumb-driven interaction on a small screen — chat-style input, visual diffs, a file tree — without moving a single byte of project data to third-party infrastructure.

The non-negotiable architectural principle: **compute and data stay 100% on the local laptop**. The app only projects the laptop's state to the phone in real time through an encrypted tunnel.

### 1.2 Problem Statement

Existing remote-terminal solutions (9remote) solve _connectivity_ but not _readability_ or _interaction comfort_ on small screens:

- Long Claude Code CLI output renders as raw monospace text (xterm.js) → horizontal wrapping, hard to read, no visual structure.
- `git diff` must be typed manually and gets cut off horizontally in portrait orientation.
- The file explorer is a bare folder-name list with no preview or quick actions.

### 1.3 Competitive Positioning

| Aspect             | 9remote (existing)                                       | Claude remote session (cloud)                 | **Beam (target)**                                              |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Output rendering   | Raw terminal (xterm.js), monospace, horizontal scrolling | Clean chat UI                                 | **Clean, mobile-tuned UI** rendered from the real shell stream |
| Filesystem access  | Full access to the local laptop                          | Empty sandbox, not connected to real projects | **Full access** to the local filesystem & git repos            |
| Code-change review | Manual `git diff` in the CLI                             | Not applicable (sandbox)                      | **Inline visual diff** + panic rollback                        |
| Live app preview   | None                                                     | None (no real dev server)                     | Deferred (out of Phase 1 scope)                                |
| Running infra cost | Third-party tunneling service                            | Ongoing cloud compute cost                    | **$0** — Cloudflare Tunnel is free; compute is your own laptop |
| Access control     | Generic access key                                       | Platform account                              | **Cloudflare Access**, personal email whitelist at the edge    |

### 1.4 Value Proposition

> "The visual comfort of a modern chat app, with the full power of your local development machine — without sending code to anyone's server."

Two core claims this product must satisfy:

1. **Versus 9remote** → win on visual comfort (structured mobile UI vs raw terminal).
2. **Versus cloud sessions** → win on real data access (actual filesystem & environment vs an empty sandbox).

---

## 2. Technical Architecture & Security Specification

### 2.1 System Topology (One-Way Trust Path)

```
[Phone browser]
     │  HTTPS/WSS (TLS 1.3)
     ▼
[Cloudflare Access gate]  ← identity check (email OTP / Google OAuth)
     │  only traffic passing the policy is forwarded
     ▼
[Cloudflare Tunnel — cloudflared daemon]
     │  outbound-only connection from the laptop; no public ports
     ▼
[Next.js fullstack server — localhost:PORT]
     │  route handlers (HTTP) + WebSocket server
     ▼
[node-pty process manager]
     │  spawn & attach pseudo-terminals
     ▼
[Claude Code CLI / bash shell / git]
```

**Critical architectural point**: `cloudflared` makes an **outbound-only** connection from the laptop to the Cloudflare edge. No port is opened to the public internet (no port forwarding, no inbound firewall rules). This eliminates the port-scanning attack class entirely.

### 2.2 Main Components

| Layer              | Technology                         | Role                                                               |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| Edge security      | Cloudflare Access (Zero Trust)     | Identity gate before a request ever touches the tunnel             |
| Transport          | Cloudflare Tunnel (`cloudflared`)  | Encrypted outbound-only pipe to a permanent domain                 |
| Application server | Next.js (App Router, Node runtime) | Serves the UI + API routes + WebSocket upgrade handler             |
| Realtime channel   | `ws` (Node WebSocket library)      | Bidirectional PTY stdin/stdout streaming ↔ browser                 |
| Process bridge     | `node-pty`                         | Spawns the shell/CLI as a pseudo-terminal, captures the raw stream |
| Client state       | Zustand                            | Terminal, file-tree, and diff-panel state in the browser           |
| Diff rendering     | `parse-diff` over unified diffs    | Converts `git diff` output → stacked mobile layout                 |
| Mobile editor      | CodeMirror 6 (mobile-tuned)        | Lightweight mini-editor with a floating toolbar                    |

### 2.3 Data Channel Specification (Secure WebSocket)

**Mandatory protocol**: WSS (WebSocket over TLS). No fallback to unencrypted `ws://` across networks, even on the LAN.

Every WebSocket frame uses a **structured JSON envelope**, never a raw string, so the frontend can distinguish payload types without heuristics:

```json
{
  "type": "pty_stdout | pty_stdin | git_diff | fs_event | heartbeat | resync",
  "sessionId": "uuid-v4",
  "seq": 10452,
  "timestamp": 1752150000000,
  "payload": "<chunk data / structured object>"
}
```

- **`seq` (sequence number)** is mandatory on every `pty_stdout` frame — used to detect frame loss when the phone's connection flaps, and to drive the resync mechanism (see Section 4).
- Stdout streaming is **not line-batched**; chunks flow as delivered by the PTY buffer so interactive output (progress bars, CLI spinners) still feels live.
- **Backpressure**: if a client consumes frames too slowly (phone backgrounded), the server buffers at most N KB per session and then drops oldest with a `truncated: true` flag — preventing laptop memory bloat from one lagging phone.

### 2.4 Security Protocol (Cloudflare Access Policy)

**Principle: blocking happens at the edge network, before a request ever reaches the laptop.**

- **Access policy**: a single email whitelist (your personal address), authenticated via email OTP or Google OAuth. Requests without a valid `CF_Authorization` JWT are rejected at the edge — the laptop never sees them.
- **Session duration**: the JWT is short-lived (24 hours recommended) to bound the exploitation window if a phone is lost.
- **Application-layer defense in depth** (a second layer, not a replacement for Access):
  - Per-WebSocket `sessionId` validation — a PTY session cannot be attached to by a mismatched sessionId.
  - **Optional command allowlist** for non-interactive endpoints (e.g. quick-action buttons) — even a stolen token is confined to the actions the UI exposes.
- **No public DNS wildcard** — the permanent domain (`beam.ardhanurfan.my.id`) is routed directly via the tunnel config (`cloudflared tunnel route dns`), with no third-party proxy.

---

## 3. Detailed Functional Requirements (Mobile-First UI/UX)

### 3.1 Agent Interaction Surface (originally chat-substituted terminal)

**UX flow**: the user types/dictates a prompt in a bottom input bar (like a chat app) → the prompt is sent as `pty_stdin` to the shell running the Claude Code CLI → raw stdout streams back and is rendered on the phone.

> **Implementation note (v1.1 revision)**: field testing showed that parsing Claude Code's TUI into chat bubbles fragments badly. The shipped implementation renders a **real terminal (xterm.js)** with the chat-style input bar and shortcut-key row on top. FR-3.1.2/3/4/5 below describe the original chat-parser approach and were superseded by the terminal view.

| Feature ID | Name                                    | Technical description                                                                                                                                                                            | Priority |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-3.1.1   | Terminal-to-chat parser engine          | Buffer PTY stdout server-side, detect message boundaries via shell-prompt regex + idle timer (±400 ms without new data = end of message), emit structured `chat_message {role, blocks[]}` events | **P0**   |
| FR-3.1.2   | Markdown renderer with forced word-wrap | Render `blocks[]`; `<pre>` blocks forced to `white-space: pre-wrap` + `overflow-wrap: anywhere` — **zero horizontal scrolling on the phone**                                                     | **P0**   |
| FR-3.1.3   | Syntax highlighting                     | Language detected from the fenced-code info string                                                                                                                                               | **P0**   |
| FR-3.1.4   | Per-code-block Copy button              | Floating button in the top-right of each block, `navigator.clipboard.writeText`                                                                                                                  | **P0**   |
| FR-3.1.5   | Apply/Save-to-file button               | Opens a path picker modal → sends the block to `/api/fs/write` → **must show a diff preview before overwriting**                                                                                 | **P0**   |
| FR-3.1.6   | Voice-to-text input (Web Speech API)    | Mic button triggers `SpeechRecognition` (`continuous: false`, `interimResults: true` for live feedback); the transcript lands in the input field for editing before send                         | **P1**   |

### 3.2 Mobile-Optimized Visual Git Review & Panic Buttons

**UX flow**: a "Source Control" tab separate from the terminal (bottom navigation) shows the changed-file list → tap a file → **stacked diff view** (not side-by-side; phone width can't afford it) → deletions (red) stacked above additions (green), per hunk.

| Feature ID | Name                              | Technical description                                                                                                                                                | Priority |
| ---------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-3.2.1   | Source Control panel              | `/api/git/status` runs `git status --porcelain=v2`, parsed into `{path, status}` with colored M/A/D badges                                                           | **P0**   |
| FR-3.2.2   | Stacked diff layout               | `/api/git/diff?file=` runs `git diff -- <file>`, parsed into hunks; each hunk renders removed lines stacked above added lines — **not the sideways unified default** | **P0**   |
| FR-3.2.3   | Quick-action macro: Commit & Push | One tap → commit-message modal → `git add -A && git commit -m "…" && git push`, output streamed to a toast/log strip                                                 | **P0**   |
| FR-3.2.4   | Quick-action macro: Stash         | `git stash push -m "quick-stash-<timestamp>"`, light confirmation (non-destructive)                                                                                  | **P1**   |
| FR-3.2.5   | Panic rollback                    | **Destructive** — mandatory two-step confirmation ("This discards ALL uncommitted changes, continue?") before `git checkout -- . && git clean -fd`                   | **P0**   |

### 3.3 File Explorer & Responsive Mini-Editor

| Feature ID | Name                                | Technical description                                                                                                                                                                                                                           | Priority |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-3.3.1   | Lazy-loading file tree              | `/api/fs/tree?path=` returns one directory level per request (not fully recursive) — saves mobile bandwidth; expand-on-tap with a per-path cache                                                                                                | **P0**   |
| FR-3.3.2   | Collapsible panel via swipe gesture | The file tree lives in a drawer that swipes in/out (native touch handlers), so it doesn't consume screen space while focused on the terminal/editor                                                                                             | **P1**   |
| FR-3.3.3   | Mini-editor (CodeMirror 6)          | Mobile-tuned theme, syntax mode from the file extension, save to `/api/fs/write`                                                                                                                                                                | **P1**   |
| FR-3.3.4   | Floating assistant toolbar          | A row of symbol keys (`Ctrl`, `Alt`, `Tab`, `Esc`, `\|`, `{`, `}`, `(`, `)`) **pinned directly above the virtual keyboard** (via the VirtualKeyboard API / `visualViewport` resize fallback) — critical because phone keyboards lack these keys | **P0**   |

### 3.4 VSCode Multi-Root Workspace Support

**UX flow**: the user picks a `.code-workspace` file (or a previously opened workspace) → the app reads it → the file explorer renders each `folders[]` entry as a separate root node — like VSCode's multi-root sidebar.

| Feature ID | Name                           | Technical description                                                                                                                                  | Priority |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-3.4.1   | Workspace file picker          | `/api/workspace/list` scans common locations (home dir, `~/Projects`, …) for `*.code-workspace`; picked from a short list in the app header            | **P0**   |
| FR-3.4.2   | Multi-root parser              | `/api/workspace/parse?file=` reads the workspace JSON, extracts `folders[]`, resolves each `path` (relative to the workspace file) to an absolute path | **P0**   |
| FR-3.4.3   | Multi-root file-tree rendering | The file explorer receives the root-path array and renders each folder as a separate top-level node                                                    | **P0**   |

**Out of scope for this simple version** (deferred, not dropped): cross-repo git status aggregation in the Source Control panel, and `settings.json` inheritance (`files.exclude`, etc.) from the workspace. If multi-repo work makes aggregated status genuinely needed, that upgrade goes first.

---

## 4. Persistence & Daemon State Management

**The core problem**: a Claude Code CLI process in the middle of a heavy refactor **must not die** just because the phone's WebSocket dropped (signal dead zone, app backgrounded, screen locked).

- **Detach, don't kill**: every PTY session is owned by a server-side process manager **independent of any WebSocket connection**. On disconnect the PTY keeps running (`pty.process` is not killed); only output consumption pauses. The session registry is an in-memory `Map<sessionId, { pty, buffer, lastSeq }>`.
- **Ring buffer per session**: each session keeps the last N KB of output (256 KB / ~5000 lines recommended) with a per-chunk sequence number — structured replay, not just raw text.
- **Resync mechanism**: on reconnect the client sends `{type: "resync", sessionId, lastKnownSeq}`. The server compares against the buffer:
  - Gap still covered by the buffer → replay the missed chunks (`seq > lastKnownSeq`); the client merges without duplication.
  - Gap exceeds the buffer (phone offline too long) → the server sends `{type: "resync", truncated: true}` + a snapshot of current state (not full history); the UI shows a "some output was missed" indicator.
- **Heartbeat**: client pings every 15 s; the server marks a session "dormant" (not deleted) after 45 s without a pong — the PTY stays alive, only the UI status flips to "disconnected, will resume on reconnect".
- **Idle session bound**: PTY sessions dormant longer than **X hours** (configurable, default 12) are finally terminated to prevent resource leaks from truly abandoned sessions.

---

## 5. Scope & Development Roadmap

### 5.1 MVP Scope — Phase 1

> **Scope-change note**: Embedded Live Preview (the old FR-3.4.x) is **removed from the active roadmap**, not merely deferred — focus returns to the core phone workflow (terminal/git/files) until working from the phone is genuinely viable. The FR-3.4.x slot is now VSCode Multi-Root Workspace Support (revised Section 3.4).

**In scope for Phase 1:**

- Local Next.js fullstack server + WebSocket server with the envelope protocol (Section 2.3).
- `node-pty` bridge to the shell (spawning the Claude Code CLI / bash).
- Agent interaction surface (Section 3.1) with forced word-wrap rendering.
- Source Control panel + stacked diff (FR-3.2.1, FR-3.2.2) + Commit & Push and Panic Rollback (FR-3.2.3, FR-3.2.5).
- Lazy-loading file tree (FR-3.3.1) + workspace picker & multi-root parser (FR-3.4.1–3) — simple version, no cross-repo git aggregation.
- Cloudflare Tunnel + Access setup (permanent domain, email whitelist).
- Basic resync mechanism (Section 4) — without it the product is no better than 9remote when the phone's signal drops.

**Deferred to Phase 2 (P1, explicitly outside the MVP):**

- CodeMirror mini-editor + floating toolbar (FR-3.3.3, FR-3.3.4).
- Voice-to-text (FR-3.1.6).
- Git stash macro (FR-3.2.4).
- Swipe gesture for the file tree (FR-3.3.2) — Phase 1 may use a plain toggle button.
- Cross-repo git status aggregation for multi-root workspaces.

### 5.2 Phase Roadmap

| Phase                                 | Deliverable                                                                                                                     | Exit criteria                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 — Core Bridge & Workspace** | Next.js + WS server, PTY bridge, Cloudflare Tunnel/Access live on the permanent domain, workspace picker + multi-root file tree | The user can send a prompt from the phone, receive live output over WSS, reconnect automatically after a short drop, and open the same multi-repo `.code-workspace` used in VSCode |
| **Phase 2 — Terminal & Git UX**       | Polished terminal rendering, stacked diff, panic rollback                                                                       | Claude Code output is readable with no horizontal scrolling; the user can review & roll back changes from the phone without a manual CLI                                           |
| **Phase 3 — Editor & Voice Input**    | Mini-editor, floating toolbar, voice-to-text                                                                                    | The user can edit small files directly from the phone and dictate prompts hands-free                                                                                               |

---

_This document is the binding technical specification for Phase 1. Changes to the security architecture (Section 2.4) require re-review before implementation._
