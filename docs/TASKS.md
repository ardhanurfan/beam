# Beam — Task Tracker

> Tracking file for the implementation based on [PRD.md](./PRD.md) v1.0 and [DESIGN.md](./DESIGN.md). Future feature candidates live in [ROADMAP.md](./ROADMAP.md).
> Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred

**Started**: July 9, 2026 · **App**: Beam (renamed from "Mobile Mission Control" on July 12) · Default port: **2424**

---

## M0 — Project Scaffold & Foundation

- [x] M0.1 Init Next.js 16 (App Router, TypeScript, Node runtime)
- [x] M0.2 Custom server (`server/index.ts`): Next.js handler + `ws` WebSocket upgrade on one port (`/ws`), bound to 127.0.0.1 only
- [x] M0.3 Core deps: `ws`, `node-pty`, `zustand`, `xterm`, `parse-diff`, `codemirror`, `lucide-react`
- [x] M0.4 Design tokens from DESIGN.md → Tailwind 4 `@theme` (`globals.css`): monochrome core, lime accent, `block-*` pastels, pill radius, Inter + JetBrains Mono
- [x] M0.5 Mobile-first layout: bottom tab bar (Terminal · Source · Files) + workspace picker in the header

## M1 — PTY Bridge & WebSocket Protocol (PRD Sections 2.3 & 4)

- [x] M1.1 `PtySessionManager` (`server/pty-manager.ts`): `Map<sessionId, {pty, buffer, lastSeq}>` registry, **detach-not-kill** on WS disconnect
- [x] M1.2 Envelope JSON protocol (`src/lib/protocol.ts`): `{type, sessionId, seq, timestamp, payload}` — `pty_stdout | pty_stdin | pty_stdin_raw | resize | heartbeat | resync | session_state`
- [x] M1.3 256 KB ring buffer per session with per-chunk `seq`
- [x] M1.4 Resync: replay the gap from the buffer, or `truncated: true` + snapshot when the gap exceeds the buffer
- [x] M1.5 Heartbeat ping/pong every 15s; dormant after >45s without a pong (PTY stays alive)
- [x] M1.6 Idle reaper: terminate sessions dormant for >12h (`MMC_IDLE_HOURS`)
- [x] M1.7 Backpressure: drop-oldest + `truncated` flag
- [x] M1.8 Per-connection `sessionId` validation — unknown sessionIds are rejected, a fresh session is created

## M2 — Terminal & Prompt UX (originally FR-3.1.x chat interface)

- [x] M2.1 ~~Terminal-to-chat parser UI~~ → replaced by a **real terminal** (xterm.js) after mobile testing: navy theme, touch scrolling, PTY-size sync, buffer replay on reload/reattach
- [x] M2.2 Chat-style prompt bar at the bottom (send as `pty_stdin`)
- [x] M2.3 Shortcut key row: Esc / Tab / ⇧Tab / Ctrl C / Ctrl D / Ctrl R / arrows / Enter via `pty_stdin_raw`
- [x] M2.4 Connection status (dot in header) + missed-output banner
- [x] M2.7 **FR-3.1.6 (P1)** Voice-to-Text via the Web Speech API (`use-voice-input.ts`): continuous:false, interimResults:true, transcript editable before send

## M3 — Visual Git Review & Panic Buttons (FR-3.2.x)

- [x] M3.1 **FR-3.2.1 (P0)** `/api/git/status`: `--porcelain=v2` → M/A/D/R/U/C badges
- [x] M3.2 **FR-3.2.2 (P0)** `/api/git/diff` + `parse-diff` → **stacked diff** (removed above, added below, per hunk); untracked files diffed against /dev/null
- [x] M3.3 **FR-3.2.3 (P0)** Commit & Push macro + real-time log strip (push failure degrades gracefully)
- [x] M3.4 **FR-3.2.5 (P0)** Panic Rollback: two-step dialog + server-side confirm token → `git checkout -- . && git clean -fd`
- [x] M3.5 **FR-3.2.4 (P1)** Quick Stash: `git stash push -u -m "quick-stash-<ts>"`
- [x] M3.6 Per-file discard (VSCode-style): `/api/git/discard` + confirmation dialog
- [x] M3.7 `git status -uall`: untracked **directories** are expanded into individual files — a folder row can't be diffed, and discarding one silently deletes the whole folder (this bit us hard; see the 2026-07-12 incident log entry)

## M4 — File Explorer & Workspace (FR-3.3.x & FR-3.4.x)

- [x] M4.1 **FR-3.3.1 (P0)** `/api/fs/tree`: one level per request, expand-on-tap, per-path cache
- [x] M4.2 **FR-3.4.1 (P0)** `/api/workspace/list`: scan for `*.code-workspace` in ~, ~/Projects, ~/Desktop, ~/Documents (1 level deep)
- [x] M4.3 **FR-3.4.2 (P0)** `/api/workspace/parse`: JSONC-tolerant, resolves relative `folders[]` → absolute
- [x] M4.4 **FR-3.4.3 (P0)** Multi-root tree: each folder is a top-level node; root selector pills in Source Control
- [x] M4.5 `/api/fs/read` + open-any-folder picker (`/api/workspace/browse` + `/api/workspace/open`, confined to the home subtree)
- [x] M4.6 Path-traversal guard: all fs/git endpoints confined to the active workspace roots (verified: `/etc` → 403)
- [-] M4.7 **FR-3.3.2 (P1)** Swipe drawer — shipped, then **removed 2026-07-12**: duplicated the Files tab (second `FilesView` instance, unsynced state) and the left-edge gesture collided with iOS Safari's back-swipe. The Files tab is the single entry point now
- [x] M4.8 **FR-3.3.3 (P1)** CodeMirror 6 mini-editor: dynamic syntax mode by extension (`@codemirror/language-data`), line wrapping, undo/redo, **explicit save**, unsaved-changes popup on close
- [x] M4.9 **FR-3.3.4 (P0)** Floating toolbar above the virtual keyboard (VirtualKeyboard API + `visualViewport` fallback): editor symbol keys (`{`, `}`, `(`, `)`, `|`, …)

## M5 — Security & Deployment (PRD Section 2.4)

- [x] M5.1 `docs/DEPLOYMENT.md`: Cloudflare Tunnel setup (outbound-only, no wildcard DNS, `beam.ardhanurfan.my.id`)
- [x] M5.2 `docs/DEPLOYMENT.md`: Cloudflare Access policy (email whitelist, 24-hour sessions, OTP/Google OAuth)
- [x] M5.3 Command allowlist: all git via fixed-argv `execFile` — no shell interpolation
- [x] M5.4 WSS: the client follows `location.protocol` (https→wss); the server binds loopback-only — the tunnel is the only way in
- [ ] M5.5 (Manual, on your laptop) Execute DEPLOYMENT.md: create the tunnel + Access policy in the Cloudflare dashboard

## M6 — Verification

- [x] M6.1 WS smoke test (`scripts/ws-smoke-test.mjs`, `npm run test:ws`) — spawn, stdin→output, monotonic seq, reconnect to the same session, resync replay, session survives, foreign sessionId rejected, sessions API create/kill, push API
- [x] M6.2 Terminal rendering: real TUI output verified; zero horizontal overflow at mobile widths
- [x] M6.3 Git flow: status → stacked diff → commit (push-fail degrades) → stash → per-file discard → two-step rollback (verified via curl + fixture repos)
- [x] M6.4 Multi-root: JSONC `.code-workspace` with 2 folders → 2 roots; path guard verified
- [x] M6.5 `tsc`, ESLint, `next build` — all clean
- [ ] M6.6 (Manual) Visual QA on a physical phone: keyboard toolbar, voice input (needs mic permission & HTTPS)

## M7 — Push Notifications & Multi-Session (ROADMAP R1 + R2)

- [x] M7.1 **R2** Session labels + `list()` registry exposure; `/api/sessions` (GET list, POST create with `{cwd, command, label}`), `/api/sessions/kill` (confirm-gated)
- [x] M7.2 **R2** `ws-client.ts` → `SessionHub`: one WS per session, boot from the server registry (reattaches orphaned sessions), rekey on server restart, active-session pointer in `localStorage`
- [x] M7.3 **R2** Terminal tab strip: chip per session (status dot + label), `+` spawns a shell, tap active chip → confirm-kill; one xterm pane per session, all kept mounted
- [x] M7.4 **R2** Agents tab: **Run** launches the agent into its own new session (labeled after the agent) instead of typing into the current shell
- [x] M7.5 **R1** `server/activity-monitor.ts` (repurposed chat-parser core): burst + 5s-idle boundary, waiting-input detection (prompt/confirmation regex), keystroke-echo noise floor, re-arm on stdin
- [x] M7.6 **R1** `server/push.ts`: VAPID keys auto-generated + persisted with subscriptions in `~/.beam/push.json` (0600); dead subscriptions pruned on 404/410; `MMC_PUSH_SUBJECT` env
- [x] M7.7 **R1** `/api/push` (GET key, POST subscribe, DELETE unsubscribe); pushes fire only for sessions with **zero attached clients**, max 1/min/session
- [x] M7.8 **R1** `sw.js` push + notificationclick handlers (tag per session, focus-or-open); notifications toggle in the connection sheet (iOS guidance for non-installed PWA)
- [x] M7.9 Dead code removed: `chat_message`/`git_diff`/`fs_event` frames, chat transcript machinery (`chat-parser.ts`, `chatHistory`, resync snapshot), `react-markdown`/`remark-gfm`/`shiki` deps (−113 packages), orphaned shiki CSS
- [x] M7.10 Smoke test rewritten for the new protocol + sessions/push APIs — 16/16 pass; `tsc`, ESLint, `next build` clean
- [x] M7.12 Sessions follow the workspace: `create()` without cwd defaults to the **active workspace's first root** (server-side, falls back to `~`); agent launches inherit it
- [x] M7.13 New-session root picker: `+` always opens a chooser — each workspace root (labeled by root name) or Home directory (`cwd:"~"`, expanded server-side)
- [x] M7.14 Mobile terminal fixes (real-device QA): resize cached + flushed on `session_state` (first fit races the WS handshake), sessions spawn at the requesting device's `cols`/`rows`, shell shrinks to `visualViewport` when the keyboard opens, `interactiveWidget: resizes-content`
- [x] M7.15 Shared `.sheet`/`.sheet-scroll` utilities: every bottom sheet gets the same 80dvh max height with a scrollable content region
- [ ] M7.11 (Manual) On-device QA: enable notifications on the phone (requires HTTPS + installed PWA on iOS), background the app, confirm pushes for finished/waiting sessions; multi-session tab UX + root picker

## Technical Notes

- **node-pty on macOS/arm64**: npm drops the exec bit on `spawn-helper` → `posix_spawnp failed`. Fixed via `postinstall: chmod +x node_modules/node-pty/prebuilds/*/spawn-helper`.
- **Next 16 custom server**: `getUpgradeHandler()` must be called after `app.prepare()`; the dev HMR websocket is passed through to Next's handler.
- **Tab switching**: all tab views stay mounted (CSS-hidden) — unmounting would destroy the xterm instance; `fit()` is skipped while hidden (zero-size guard).
- Test fixtures: `/tmp/mmc-test/` (2 git repos + `test.code-workspace`).
- **Claude Code shows "Visual Studio Code disconnected"** when the Beam server was launched from VSCode's integrated terminal: PTY sessions inherit `TERM_PROGRAM=vscode` etc., so Claude Code tries (and fails) to reach the IDE extension. Cosmetic; launching the server from a plain terminal avoids it. Inherited `GIT_ASKPASS` can additionally make `git push` hang waiting for a VSCode dialog.

## Log

| Date       | Update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-09 | Tracker created; M0–M4 (Phase 1) implemented; backend + WS + UI done; protocol smoke test 10/10 pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-10 | P1 features completed: voice input, quick stash, CodeMirror mini-editor, floating keyboard toolbar, swipe drawer; `pty_stdin_raw` for control keys; DEPLOYMENT.md + README; build & all tests green. Remaining: M5.5 & M6.6 (manual)                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-10 | Fixed hydration error (voice capability via `useSyncExternalStore`). Picker extended: **open any plain folder** without a `.code-workspace` — `/api/workspace/browse` (home-subtree navigation) + `/api/workspace/open` (folder → single root), guard outside the home dir                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-12 | **Major UI redesign** (feedback: chat bubbles too crowded): chat parser UI replaced with a **real xterm.js terminal** (Terminal tab, navy theme, PTY resize sync via `resize` frame, buffer replay on reload/reattach) + chat-style prompt bar & shortcut keys. All icons → **lucide-react**. **App logo** (icon.svg + PWA manifest + header mark). **Connection sheet**: laptop hostname, platform, user, IP/interface (`/api/host`), session status. Source Control: **per-file discard** (VSCode-style). Editor: **explicit save** (no autosave), Undo/Redo, unsaved-changes popup. Old chat components removed. All tests pass |
| 2026-07-12 | Terminal made touch-scrollable; tab-switch blanking fixed (views stay mounted, zero-size fit guard, client-side replay history). Logo iterations → lime tile + black prompt glyph. App renamed **Beam**, port → **2424**, folder → `beam/`. PWA installability: PNG icons (192/512/maskable/apple), manifest `id`/orientation, minimal service worker (https-only registration). README rewritten + laptop sleep recommendations (macOS/Windows)                                                                                                                                                                                   |
| 2026-07-12 | Repository language unified to **English** (docs + UI strings); DESIGN.md rewritten as the **Beam design system** (was a Figma-marketing reference doc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-12 | **Agents & skills management**: new Agents tab — detects installed coding agents (Claude Code, Codex, Gemini, Aider, OpenCode) via `/api/agents` (which + --version), one-tap launch into the terminal; skills/subagents/prompts listing per agent (Claude global+project skills & subagents, Codex prompts, Gemini commands) via `/api/skills`, with create-from-template, edit (CodeMirror sheet via `/api/skills/write`), and delete — all guarded to known agent config dirs (`~` expansion server-side; `~/.zshrc` write → 403 verified)                                                                                      |
| 2026-07-12 | **M7: Push notifications (R1) + multi-session tabs (R2)** shipped — see M7 items above. Session registry is now server-authoritative (`/api/sessions`), so killed tabs/apps reattach to every live session on reopen. Chat-parser repurposed into the notification activity monitor; chat protocol machinery deleted                                                                                                                                                                                                                                                                                                               |
| 2026-07-12 | **Docs reorganized into `docs/`**: PRD (renamed `PRD-Mobile-Mission-Control.md` → `PRD.md`), DESIGN, DEPLOYMENT, TASKS moved from the root; added `docs/README.md` (index) and `docs/ROADMAP.md` (post-PRD feature candidates R1–R7). README/AGENTS/CLAUDE stay in root. All cross-references updated                                                                                                                                                                                                                                                                                                                              |
| 2026-07-13 | Post-incident polish: user restored the **original DESIGN.md** (the Figma-marketing reference) → converted into the Beam design system with the same structure (Overview/Colors/Type/Layout/Elevation/Shapes/Components/Do's-Don'ts/Responsive/Iteration/Known Gaps); DEPLOYMENT.md expanded (checkpoints, autostart, phone setup, troubleshooting); **favicon.ico rebuilt** from the Beam mark (ICO with 16/32/48 PNG entries, `npm run icons`); `/api/fs/write` re-gained the original `previewed:true` contract |
| 2026-07-12 | **⚠ INCIDENT — working tree wiped from the phone.** While testing Source Control on the beam repo itself (everything still uncommitted), a discard/panic-rollback ran `git checkout -- . && git clean -fd` and deleted the entire implementation. Recovered from: `.next` dev sourcemaps (gitignored → survived `clean -fd`; yielded 49 originals), this session's context (server/, docs, configs, everything edited today), and VSCode local history (DEPLOYMENT.md). DESIGN.md had no surviving source and was rewritten from the `globals.css` tokens. **Lessons applied**: `git status -uall` (M3.7 — folder rows were the trigger), and COMMIT EARLY — the entire codebase had lived for 3 days with zero commits            |
