# Beam — Feature Roadmap (Phase 4+)

> Candidate features beyond the shipped PRD scope ([PRD.md](./PRD.md) Phases 1–3 are complete — see [TASKS.md](./TASKS.md)).
> Status: `[ ]` idea · `[~]` in progress · `[x]` shipped · `[-]` rejected
>
> Ordering below is the recommended implementation order. When a feature is picked up, break it into `M`-numbered tasks in [TASKS.md](./TASKS.md) and track it there; this file tracks the idea-level decision only.

---

## R1 — Push notifications when the agent needs attention

**Status**: `[x]` shipped 2026-07-12 (see TASKS.md M7) · **Priority**: P0 · **Effort**: Medium

The single biggest gap in the "work from your phone" story: after sending Claude Code a long task, the user has no way to know when it finished or is waiting for a confirmation ("Do you want to…?") without re-opening the app and staring at the terminal. Push closes that loop and turns Beam from a remote terminal into an actual mission control.

**Implementation sketch**

- **Trigger detection (server)**: in `server/pty-manager.ts`, per session, track output activity. Fire an event when (a) output goes idle for ~5 s after a burst of activity ("agent likely finished / waiting"), and/or (b) the tail of the ring buffer matches known confirmation prompts (Claude Code's `Do you want`, `❯` menu markers, shell prompt regex).
- **Web Push plumbing**: `web-push` npm package; VAPID keys auto-generated; endpoints under `/api/push`; subscriptions persisted so they survive server restarts.
- **Service worker**: `push` + `notificationclick` handlers in `public/sw.js` (focus/open the PWA).
- **Client**: notification opt-in toggle in the connection sheet; no notifications while a client is attached to the session.
- **Debounce**: max 1 notification per session per minute; re-arm on new stdin.

**Acceptance criteria**

- Phone locked, Claude Code finishes a task → notification arrives within ~10 s.
- Claude Code asks a y/n confirmation → notification "Claude is waiting for input".
- No notifications while the app is foregrounded; no notification storms during streaming output.

---

## R2 — Multi-session terminal tabs

**Status**: `[x]` shipped 2026-07-12 (see TASKS.md M7) · **Priority**: P1 · **Effort**: Medium

`PtySessionManager` is already a `Map<sessionId, …>` — the backend is multi-session by design; only the UI is single-session. Session tabs enable one agent per repo, or Claude Code + a plain shell side by side, and pair naturally with the Agents tab (launch each agent into its own session).

**Implementation sketch**

- **Server**: session labels; REST registry `/api/sessions` (list/create/kill) — the server is the source of truth, so a reopened phone reattaches to every live session (solves the killed-tab orphan problem structurally).
- **Client**: `SessionHub` — one WS per session; multiplexing by `sessionId`; rekey on server restart.
- **UI**: chip/tab strip above the terminal; one xterm instance per session kept mounted; "+" opens a root picker; active-chip tap → confirm-kill.
- **Agents tab**: "Launch" spawns into a new session labeled after the agent.

**Acceptance criteria**

- Two sessions run concurrently; switching tabs preserves scrollback of both.
- Phone reconnect resyncs every session (per-session `lastSeq`), not just the active one.
- Killing a session from the UI terminates its PTY; the idle reaper still applies per session.

---

## R3 — Send images from the phone to Claude Code

**Status**: `[ ]` · **Priority**: P1 · **Effort**: Small

On a phone you often want to say "make it look like this" with a screenshot or photo. Claude Code accepts image paths in prompts, so the whole feature is: get the image onto the laptop, then insert its path into the prompt.

**Implementation sketch**

- **API**: `POST /api/fs/upload` (multipart) → saves to `<active-workspace-root>/.beam/uploads/<ts>-<name>` (gitignored), guarded by the existing workspace-root confinement.
- **Prompt bar**: camera/gallery button (`<input type="file" accept="image/*" capture>`) in the prompt bar; after upload, insert the absolute path into the input field so the user can type around it.
- **Cleanup**: reap uploads older than N days on server start.

**Acceptance criteria**

- Photo from the phone camera lands on the laptop and its path is in the prompt within one tap + confirm.
- Upload outside the active workspace roots is rejected (403), consistent with `fs/write`.

---

## R4 — Cross-repo git status aggregation

**Status**: `[ ]` · **Priority**: P1 · **Effort**: Small

The only item the PRD explicitly marks "deferred, not dropped" (PRD §3.4). Source Control is currently per-root behind selector pills; with a multi-repo `.code-workspace` you can't see at a glance *which* repos have changes.

**Implementation sketch**

- **API**: `/api/git/status-all` — run `git status --porcelain=v2` across all active roots in parallel (`Promise.all`, existing fixed-argv `execFile` helper in `src/lib/server/git.ts`); return `{root, changedCount, files[]}[]`.
- **UI**: `git-view.tsx` gains an "All repos" default view — one section per repo with changed files inline; root pills become filters. Badge with total changed-file count on the Source tab in `bottom-nav.tsx`.
- Commit/stash/rollback stay per-repo (no cross-repo macros — matches PRD's simple-version boundary).

**Acceptance criteria**

- Workspace with 3 roots, 2 dirty → both dirty repos visible on one screen without switching pills.
- Per-repo actions (commit, discard, rollback) operate only on their own root.

---

## R5 — Live dev-server preview

**Status**: `[ ]` · **Priority**: P2 · **Effort**: Large

Cut from Phase 1 to protect focus (PRD §5.1), but the core is mature now. Claude Code edits a web app → the user wants to *see* it from the phone without a second tunnel.

**Implementation sketch**

- **Port detection**: `/api/preview/ports` — scan listening TCP ports on localhost (e.g. `lsof -iTCP -sTCP:LISTEN`) and heuristically label dev servers (3000, 5173, 8080…).
- **Reverse proxy**: in `server/index.ts`, proxy `/preview/<port>/*` → `http://127.0.0.1:<port>/*` (http + WS upgrade for HMR). Path-prefix rewriting is the hard part — many dev servers assume root; start with servers that honor a base path, document the limitation.
- **UI**: Preview tab or button in the header → full-screen iframe with a reload button and port picker.
- **Security**: proxy only allowlisted localhost ports; everything still rides behind Cloudflare Access.

**Acceptance criteria**

- `npm run dev` on the laptop → phone renders the app through the existing tunnel, HMR included.
- Non-listening or non-allowlisted ports return 403/502, never a hang.

---

## R6 — Prompt snippets & history

**Status**: `[ ]` · **Priority**: P2 · **Effort**: Small

Typing recurring prompts ("run the tests and fix failures", "commit with a conventional message") on a phone keyboard is friction the desktop never had.

**Implementation sketch**

- **History**: store the last ~50 sent prompts in `localStorage` (client-only, no API needed); swipe-up or `↑`-style affordance above the prompt bar.
- **Snippets**: user-defined templates persisted server-side in `~/.beam/snippets.json` (same guarded-config-dir pattern as `/api/skills`); manage them from the Agents tab; long-press a snippet to edit.
- One tap inserts into the input field (editable before send) — same contract as voice input.

**Acceptance criteria**

- A prompt sent yesterday is recallable in ≤2 taps after an app reload.
- Snippets sync across devices (they live on the laptop, not the phone).

---

## R7 — Per-file / per-hunk staging

**Status**: `[ ]` · **Priority**: P2 · **Effort**: Medium

Commit & Push currently does `git add -A` — all or nothing. The stacked-diff view already renders hunks, so per-hunk staging is the natural completion of the mobile review flow.

**Implementation sketch**

- **API**: `/api/git/stage` + `/api/git/unstage` (`git add -- <file>` / `git restore --staged -- <file>`); per-hunk via `git apply --cached` with a hunk patch generated from the already-parsed `parse-diff` output.
- **UI**: checkbox per file in `git-view.tsx` (staged/unstaged sections like VSCode); stage/unstage button per hunk in `stacked-diff.tsx`; Commit macro commits only the index when anything is staged, falls back to `add -A` when nothing is.

**Acceptance criteria**

- Stage one of two changed files → commit contains only that file.
- Hunk-level stage on a multi-hunk file produces the correct partial index (`git diff --cached` matches the selected hunk).

---

## R8 — Jira tasks & agent task automation

**Status**: `[~]` Phase 1 shipped 2026-07-14 (see TASKS.md M8.6–M8.7) · **Priority**: P1 · **Effort**: Large (phased)

Beam knows how to run agents; the work queue lives in Jira (or in your head). Bridging them turns "read the ticket on the phone, retype it to Claude" into one tap — and later into scheduled, unattended runs with push-based approval.

**Phase 1 — Tasks tab (shipped)**

- Jira subtab, env-gated (`JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN`); the token stays on the laptop, every request proxied server-side. Assigned issues + full detail; descriptions converted ADF→markdown (links, code, mentions) by `src/lib/server/jira.ts`.
- My Tasks subtab: custom markdown task files in `~/.beam/tasks` (path-guarded CRUD).
- Unified run flow: editable auto-composed prompt → installed agent → **required** directory → optional skills/subagents → new PTY session; the server types the prompt into the agent's TUI once boot output goes quiet (`initialInput`, bracketed paste for multi-line).
- Deliberately deferred: per-task auto-branching and Jira status transitions (fold into Phase 2).

**Phase 2 — Queue runner (idea)**

- Sequential per-repo task queue on the server: `queued → branch created → agent running → waiting-approval → done/failed`; one task at a time per repo protects the working tree.
- Reuses `ActivityMonitor` + Web Push: "agent is waiting for approval" lands on the phone; approve from the terminal.
- Auto-branch per task (`feature/<KEY>` via the existing `/api/git/checkout`) and optional Jira transition to In Progress / In Review.

**Phase 3 — Triggers (idea)**

- Cron on the server (laptop must be awake — `caffeinate`, see README sleep settings) and/or a Jira webhook through the existing tunnel (secret-gated endpoint).
- Permission posture per rule: default **semi-auto** (TUI asks, push notifies); full-auto (`--permission-mode` / `--allowedTools`) strictly opt-in per rule — branch isolation before any run (2026-07-12 incident is the cautionary tale).

**Acceptance criteria (Phase 2+)**

- A queued task runs unattended until the agent needs approval; the phone gets a push and the terminal shows the pending prompt.
- Two tasks against the same repo never run concurrently.
- Laptop asleep = queue paused, never lost.

---

## Rejected / parked

- **Chat-bubble parsing of Claude Code TUI** — attempted, replaced by the real xterm.js terminal (see TASKS.md M2.1). Don't revisit unless Claude Code ships a machine-readable output mode. The parser's idle-timer/prompt-regex core was repurposed into `server/activity-monitor.ts` as the R1 notification trigger; the `chat_message` protocol frames and chat transcript machinery were removed as dead code (2026-07-12).
- **Session rename UI** — labels are auto-derived (agent name or cwd basename); a rename affordance is deferred until auto-labels prove insufficient.
- **File-tree swipe drawer (FR-3.3.2)** — shipped, then removed on real-device feedback (2026-07-12): it duplicated the Files tab outright and the left-edge swipe collided with iOS Safari's back gesture. Don't rebuild; if peek-while-in-terminal ever matters, prefer a split view over a gesture.
