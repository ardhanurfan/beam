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

## 0. Prerequisites — put your domain on Cloudflare first

**Yes, the domain must be connected to Cloudflare before anything else.** The tunnel routes a hostname (`beam.ardhanurfan.my.id`), and a hostname can only exist on a DNS zone that lives in your Cloudflare account. Without an active zone, the Access/Tunnel steps have nothing to attach to.

1. In [dash.cloudflare.com](https://dash.cloudflare.com) → sidebar **Domains** → **Add a domain** (a.k.a. "Onboard a domain"). Enter the bare domain (`ardhanurfan.my.id`), pick the **Free** plan.
2. Cloudflare shows two **nameservers** (e.g. `xxx.ns.cloudflare.com`). Go to your domain **registrar** (where you bought the domain) and replace its nameservers with those two.
3. Wait until the zone shows **Active** in the Domains list (minutes to a few hours, depending on the registrar).

Then:

| What | Why |
| --- | --- |
| `cloudflared` installed — `brew install cloudflared` | The tunnel daemon |
| A (free) Zero Trust team — sidebar **Zero Trust** (under *Protect & Connect*); first visit asks you to pick a team name and the Free plan | Hosts the Access policy |
| Beam builds and runs locally (`npm run build && npm start`) | Don't debug two things at once |

> **Finding your way in the redesigned dashboard (2025+)**: the old one.dash.cloudflare.com layout was folded into the main dashboard. Everything Zero Trust (Access applications, Tunnels) now lives under sidebar **Zero Trust** → it opens the Zero Trust area with its own menu: **Access → Applications** for policies, **Networks → Tunnels** for tunnel status.

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

In [dash.cloudflare.com](https://dash.cloudflare.com) → sidebar **Zero Trust** (under *Protect & Connect*) → **Access → Applications** (first visit to Zero Trust asks for a team name — pick anything — and the Free plan):

1. **Add an application** → type **Self-hosted**.
2. **Application domain**: `beam.ardhanurfan.my.id` — leave the path empty so **all paths including `/ws`** are covered.
3. **Session Duration**: **24 hours** — a short-lived `CF_Authorization` JWT bounds the exploitation window if your phone is lost.
4. Add a policy → Action **Allow** → Include → **Emails** → your personal email address, nothing else.
5. **Login methods**: nothing to configure in the app wizard. Since June 2026, new Zero Trust orgs default to the **Cloudflare identity provider** — the login page asks you to sign in with your **Cloudflare account**, and your Allow-by-email policy is checked against that account's email. For a single-user setup this works as-is.
   - Prefer classic email OTP ("send me a code") instead? Add it under **Zero Trust → Integrations → Identity providers → Add new identity provider → One-time PIN** — the login page then offers both.
   - Google one-tap login lives in the same place (**Add new identity provider → Google**, needs a Google Cloud OAuth client; optional).

Requests without a valid `CF_Authorization` cookie are rejected at the edge — the laptop never sees them.

**Checkpoint**: opening `https://beam.ardhanurfan.my.id` (tunnel not yet running) should already show the Cloudflare Access login page, not a connection error.

## 4. Run everything

```bash
# Terminal 1 — Beam (production build)
npm run build
caffeinate -dims npm start   # binds 127.0.0.1:2424 — loopback only, by design

# Terminal 2 — the tunnel
cloudflared tunnel run beam
```

> **Why `caffeinate -dims`**: Beam only lives while the Mac is awake — sleep kills the server, every PTY session, and the tunnel. `caffeinate` (built into macOS) blocks sleep for as long as the wrapped command runs and releases it the moment the server stops: `-d` display sleep, `-i` idle sleep, `-m` disk sleep, `-s` system sleep (effective on AC power). It cannot prevent **lid-close** sleep — keep the lid open with the display off (or use clamshell mode / Amphetamine). More in the README's laptop-sleep section.

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
| Can't find Access/Tunnels in the dashboard | Redesigned nav: sidebar **Zero Trust** → Access → Applications (policies) / Networks → Tunnels (tunnel status) |
| `tunnel route dns` fails / hostname won't attach | The domain zone isn't **Active** yet — nameservers at the registrar don't point to Cloudflare, or propagation is still in progress (step 0) |
| `Access login loops / 403 after login` | Policy email doesn't match the address you logged in with — check the Allow policy |
| Page loads, status dot stays red | Beam isn't running on `:2424`, or `config.yml` points at the wrong port — check `npm start` and `curl 127.0.0.1:2424/api/host` on the laptop |
| Terminal connects but drops every ~min | Phone locked kills the socket — expected; the session resyncs on reconnect (detach-not-kill) |
| `DNS_PROBE_FINISHED / NXDOMAIN` | `tunnel route dns` step missing, or DNS not yet propagated |
| Notifications toggle says "Not available here" | iOS: the PWA must be installed to the Home Screen (iOS 16.4+); everywhere: must be HTTPS |
| Everything dies when the lid closes | See "Recommended laptop sleep settings" in the README |
