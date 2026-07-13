# Beam

<img src="src/app/icon.svg" width="80" alt="Beam logo" />

**Beam your laptop's AI coding agent to your phone.**

Beam is a one-way visual bridge between a mobile browser and the laptop running your AI coding agent (Claude Code CLI). Compute and data stay 100% on the laptop — the phone only receives a real-time projection of its state over an encrypted tunnel. Installable as a PWA.

Docs live in [`docs/`](./docs/README.md) — product spec: [PRD.md](./docs/PRD.md) · design system: [DESIGN.md](./docs/DESIGN.md) · progress: [TASKS.md](./docs/TASKS.md) · what's next: [ROADMAP.md](./docs/ROADMAP.md)

## Features

- **A real terminal on your phone** — xterm.js renders Claude Code's TUI exactly as it appears on the laptop (colors, spinners, box drawing). Touch is read-and-scroll only (scrolling never summons the keyboard), font size is adjustable (`A− / A+` — the PTY resizes so the TUI reflows instead of clipping), a jump-to-latest button appears while reading scrollback, and input goes through a chat-style prompt bar, voice-to-text, and shortcut keys (`Esc · Tab · ⇧Tab · Ctrl C/D/R · arrows · Enter`) that mobile keyboards lack.
- **Multiple sessions, tabs like a real terminal** — run Claude Code and a plain shell (or several agents) side by side; the server is the source of truth, so reopening the app reattaches to every live session, even ones another device started.
- **Push notifications when the agent needs you** — if nobody is watching a session and its output goes quiet, your phone gets a push: "waiting for your input" or "task likely finished". Opt in from the connection sheet.
- **Mobile source control** — per-repo status list, stacked diffs (removed above, added below), per-file discard like VSCode, Commit & Push, Quick Stash, a two-step Panic Rollback, and branch awareness: a chip shows the current branch with ahead/behind counts, and a sheet switches to or creates branches (plain non-forced checkout — git refuses rather than clobbers, with a "Stash first" shortcut when the tree is dirty).
- **File explorer + editor** — open any folder or a multi-root `.code-workspace` (VSCode), lazy-loaded tree, CodeMirror 6 mini-editor with undo/redo, explicit save, and an unsaved-changes prompt.
- **Sessions that survive disconnects** — the PTY keeps running when the phone drops (detach, not kill); a 256 KB ring buffer plus sequence-number resync replays missed output; 15-second heartbeat; dormant sessions are reaped after 12 hours.
- **Tasks: Jira + your own** — a Tasks tab with two subtabs. **Jira** (appears only when the `JIRA_*` env vars are set; the token never leaves the laptop) lists issues assigned to you and shows the full detail — status, epic, labels, priority, and the complete description with clickable links and code blocks, converted server-side from ADF to markdown. **My Tasks** are plain markdown files in `~/.beam/tasks` (create, edit, delete in-app). Either kind runs with one tap: review the auto-composed prompt (editable), pick an installed agent and a working directory (required), optionally attach skills/subagents, and Beam starts a terminal session and types the prompt into the agent's TUI once it finishes booting.
- **Agents & skills management** — detects the coding agents installed on the laptop (Claude Code, Codex, Gemini, Aider, …), launches any of them into its own terminal session with one tap, and manages their skills/subagents/prompts (list, create from template, edit, delete) from the phone. Skills shipped by enabled Claude Code plugins are viewable read-only.
- **PWA** — full manifest + service worker; "Add to Home Screen" turns it into a standalone app.

## Running

```bash
npm install
npm run dev        # http://127.0.0.1:2424 (UI + API + WebSocket /ws)
```

Production:

```bash
npm run build
npm start          # port 2424, binds to 127.0.0.1 only
```

Secure exposure to your phone via Cloudflare Tunnel + Access: see [DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Configuration (env)

Copy [`.env.example`](./.env.example) to `.env` and adjust (all variables are optional):

```bash
cp .env.example .env
```

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `2424` | Local server port |
| `MMC_SHELL` | `$SHELL` | Shell/binary spawned per PTY session |
| `MMC_IDLE_HOURS` | `12` | Max age of a dormant session before termination |
| `MMC_PUSH_SUBJECT` | `mailto:beam@example.com` | VAPID contact identity sent to the browser push service — set your own address |
| `JIRA_BASE_URL` | — | Jira Cloud instance, e.g. `https://yourcompany.atlassian.net`. The Jira subtab in Tasks appears only when all three `JIRA_*` vars are set |
| `JIRA_EMAIL` | — | Atlassian account email for the API token |
| `JIRA_API_TOKEN` | — | API token (id.atlassian.com → Security → API tokens). Stays on the laptop; requests are proxied server-side |

## Recommended laptop sleep settings

Beam only lives while the laptop is awake — if the laptop sleeps, the server, PTY sessions, and tunnel die with it. To use Beam from your phone at any time:

### macOS

1. **System Settings → Battery → Options** → enable **"Prevent automatic sleeping on power adapter when the display is off"** — the laptop stays awake on charger even with the display off.
2. In the same Options menu, set **"Wake for network access"** to On (or *Only on power adapter*).
3. Per-session alternative without changing settings — wrap the server in `caffeinate`:
   ```bash
   caffeinate -dims npm start
   ```
4. Note: **closing the lid still puts the Mac to sleep** (unless in clamshell mode with an external display + power). Leave the lid open with the display off, or use an app like Amphetamine if you want lid-closed operation.

### Windows

1. **Settings → System → Power & battery → Screen and sleep** → set **"When plugged in, put my device to sleep" = Never**. Via terminal:
   ```powershell
   powercfg /change standby-timeout-ac 0
   ```
2. **Control Panel → Power Options → Choose what closing the lid does** → set **"Do nothing"** while *Plugged in*.
3. Keep the network adapter alive when idle: **Device Manager → network adapter → Properties → Power Management** → uncheck **"Allow the computer to turn off this device to save power"**.
4. Disable hibernation on AC so long idle periods don't cut sessions:
   ```powershell
   powercfg /change hibernate-timeout-ac 0
   ```

> All of the above applies to the **plugged in** state only — on battery, keep the defaults to preserve battery health. In practice: keep the charger connected, let the screen turn off, never let the laptop sleep.

## Architecture

```
Phone (PWA) ──wss──> Cloudflare Access ──> Cloudflare Tunnel ──> server/index.ts (127.0.0.1:2424)
                                                                  ├─ Next.js — UI + /api/*
                                                                  └─ ws-server — /ws (envelope protocol, resync)
                                                                      └─ pty-manager ── node-pty ── Claude Code CLI
```

| Part | Contents |
|---|---|
| `server/` | Custom Node server: PTY session manager (ring buffer, detach-not-kill, resync), WebSocket envelope protocol, activity monitor (push triggers), Web Push (VAPID keys + subscriptions in `~/.beam/push.json`) |
| `src/app/api/` | `git/*` (status, diff, commit, stash, discard, rollback, branches, checkout) · `fs/*` (tree, read, write) · `workspace/*` (list, parse, browse, open, active) · `sessions` + `sessions/kill` (PTY session registry) · `push` (notification subscriptions) · `agents` + `skills/*` (detect agents, manage skills) · `jira/*` (assigned issues + detail, ADF→markdown, env-gated) · `tasks/*` (custom markdown tasks in `~/.beam/tasks`) · `host` (laptop & network info) |
| `src/components/` | terminal (xterm), git, files/editor, tasks (Jira + custom + run-task flow), workspace picker, connection sheet |
| `src/app/globals.css` | Design tokens from docs/DESIGN.md (Tailwind 4 `@theme`) |

Layered security: identity gate at the edge (Cloudflare Access), git runs through fixed-argv `execFile` (no shell injection), every fs/git endpoint is confined to the active workspace roots, and destructive actions require explicit confirmation (server-side tokens).

## Tests

```bash
npm run test:ws    # WS protocol smoke test against the server on :2424
```
