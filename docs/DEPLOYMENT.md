# Deployment — Cloudflare Tunnel + Access (PRD Section 2.4)

One-way trust path:

```
Phone ──https/wss──> Cloudflare Access (identity gate)
                        └─> Cloudflare Tunnel (outbound-only from the laptop)
                              └─> Beam on 127.0.0.1:2424
```

The laptop **never opens a public port** — `cloudflared` dials *out* to Cloudflare's edge and keeps the pipe alive. No port forwarding, no inbound firewall rules, no port-scanning attack surface. Access blocks every request that isn't you **at the edge**, before it ever reaches the laptop.

Time needed: ~20 minutes once you have a domain on Cloudflare.

---

## 0. Prerequisites

| What | Why |
| --- | --- |
| A domain whose DNS is on Cloudflare (example here: `ardhanurfan.my.id`) | The tunnel needs a hostname to route (`beam.ardhanurfan.my.id`) |
| `cloudflared` installed — `brew install cloudflared` | The tunnel daemon |
| A (free) Cloudflare Zero Trust team — created automatically the first time you open [one.dash.cloudflare.com](https://one.dash.cloudflare.com) | Hosts the Access policy |
| Beam builds and runs locally (`npm run build && npm start`) | Don't debug two things at once |

## 1. Create the tunnel (one-time)

```bash
cloudflared tunnel login          # opens the browser — authorize your zone
cloudflared tunnel create beam    # writes ~/.cloudflared/<TUNNEL_ID>.json (credentials)
cloudflared tunnel route dns beam beam.ardhanurfan.my.id
```

> Per the PRD: **no wildcard DNS**. One permanent hostname, routed straight to the tunnel — no third-party proxy in between.

**Checkpoint**: `cloudflared tunnel list` shows `beam` with an ID, and the DNS record `beam.ardhanurfan.my.id` (type CNAME → `<TUNNEL_ID>.cfargotunnel.com`) exists in the Cloudflare DNS dashboard.

## 2. Tunnel config

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: beam
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Everything on the hostname goes to Beam — including the /ws WebSocket
  # upgrade, which cloudflared proxies transparently.
  - hostname: beam.ardhanurfan.my.id
    service: http://127.0.0.1:2424
  # Any other hostname that reaches this tunnel gets a 404.
  - service: http_status:404
```

## 3. Access policy — REQUIRED **before** running the tunnel

Do this first: the moment the tunnel runs, the hostname is publicly reachable; Access is what makes it yours-only.

In [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Access → Applications**:

1. **Add an application** → type **Self-hosted**.
2. **Application domain**: `beam.ardhanurfan.my.id` — leave the path empty so **all paths including `/ws`** are covered.
3. **Session Duration**: **24 hours** — a short-lived `CF_Authorization` JWT bounds the exploitation window if your phone is lost.
4. Add a policy → Action **Allow** → Include → **Emails** → your personal email address, nothing else.
5. **Login methods**: One-time PIN (email OTP) is zero-setup; add Google OAuth if you prefer one-tap login.

Requests without a valid `CF_Authorization` cookie are rejected at the edge — the laptop never sees them.

**Checkpoint**: opening `https://beam.ardhanurfan.my.id` (tunnel not yet running) should already show the Cloudflare Access login page, not a connection error.

## 4. Run everything

```bash
# Terminal 1 — Beam (production build)
npm run build
npm start                    # binds 127.0.0.1:2424 — loopback only, by design

# Terminal 2 — the tunnel
cloudflared tunnel run beam
```

**Checkpoint**: on the phone, `https://beam.ardhanurfan.my.id` → Access login (email OTP) → Beam UI with a green status dot. The terminal works end-to-end (type `echo ok`).

### Autostart (recommended)

So the bridge survives reboots:

```bash
# cloudflared as a system service (launchd on macOS)
sudo cloudflared service install
```

For Beam itself, either keep a terminal running `caffeinate -dims npm start` (also prevents sleep — see README), or create a LaunchAgent that runs `npm start` in the repo directory at login.

## 5. Phone setup

1. Open `https://beam.ardhanurfan.my.id`, log in through Access.
2. **Install the PWA** — iOS: Share → *Add to Home Screen* (required for push notifications); Android: the install prompt or ⋮ → *Install app*.
3. Open the installed app → tap the status dot → **Notifications → Turn on** (see `MMC_PUSH_SUBJECT` in `.env.example`).

## 6. WSS notes

- The phone always connects via `https://…`, so the client automatically speaks `wss://` (see `src/lib/ws-client.ts` — the scheme follows `location.protocol`). There is no cross-network `ws://` fallback.
- TLS 1.3 terminates at the Cloudflare edge; the edge↔laptop hop is the tunnel's own encryption; the final hop is loopback-only.
- Access covers `/ws` because the WebSocket upgrade is a normal HTTPS request carrying the `CF_Authorization` cookie.

## 7. Application-layer defense in depth

Built into the code — a second layer, not a replacement for Access:

| Guard | Location |
| --- | --- |
| Per-connection `sessionId` validation — a foreign sessionId can never attach to another session's PTY | `server/ws-server.ts` |
| All git commands via fixed-argv `execFile` (no shell) — commit messages can't inject commands | `src/lib/server/git.ts` |
| fs/git endpoints confined to the active workspace roots (path-traversal guard) | `src/lib/server/workspace.ts` |
| Skill file writes confined to known agent config dirs (`~/.zshrc` → 403) | `src/lib/server/agents.ts` |
| Panic Rollback requires the exact confirm token from the two-step dialog | `/api/git/rollback` |
| Session kill and skill delete require an explicit `confirm: true` | `/api/sessions/kill`, `/api/skills/delete` |
| File writes require the `previewed` flag (no blind writes) | `/api/fs/write` |

## 8. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Access login loops / 403 after login` | Policy email doesn't match the address you logged in with — check the Allow policy |
| Page loads, status dot stays red | Beam isn't running on `:2424`, or `config.yml` points at the wrong port — check `npm start` and `curl 127.0.0.1:2424/api/host` on the laptop |
| Terminal connects but drops every ~min | Phone locked kills the socket — expected; the session resyncs on reconnect (detach-not-kill) |
| `DNS_PROBE_FINISHED / NXDOMAIN` | `tunnel route dns` step missing, or DNS not yet propagated |
| Notifications toggle says "Not available here" | iOS: the PWA must be installed to the Home Screen (iOS 16.4+); everywhere: must be HTTPS |
| Everything dies when the lid closes | See "Recommended laptop sleep settings" in the README |
