// M6.1 smoke test: session spawn → stdin → pty_stdout stream → disconnect →
// reconnect with sessionId → resync replays missed frames. Extended for
// ROADMAP R2: /api/sessions list / create / kill.
import WebSocket from "ws";

const BASE = process.env.MMC_URL ?? "ws://127.0.0.1:2424/ws";
const HTTP_BASE = BASE.replace(/^ws/, "http").replace(/\/ws$/, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const ws = new WebSocket(`${BASE}?${qs}`);
  const frames = [];
  ws.on("message", (raw) => frames.push(JSON.parse(raw.toString())));
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, frames }));
    ws.on("error", reject);
  });
}

const send = (ws, type, sessionId, payload) =>
  ws.send(JSON.stringify({ type, sessionId, seq: 0, timestamp: 0, payload }));

const stdoutText = (frames) =>
  frames
    .filter((f) => f.type === "pty_stdout")
    .map((f) => f.payload)
    .join("");

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

// --- Phase 1: fresh session, send a command, expect output frames ---
const c1 = await connect();
await wait(500);
const state1 = c1.frames.find((f) => f.type === "session_state");
check("session_state received on connect", !!state1);
check("session_state carries a label", typeof state1?.payload?.label === "string");
const sessionId = state1.sessionId;

send(c1.ws, "pty_stdin", sessionId, "echo MMC_TEST_$((40+2))");
await wait(1500);

check("pty_stdout contains command output",
  stdoutText(c1.frames).includes("MMC_TEST_42"));
const stdoutFrames = c1.frames.filter((f) => f.type === "pty_stdout");
check("pty_stdout frames carry increasing seq", stdoutFrames.length > 0 &&
  stdoutFrames.every((f, i, a) => i === 0 || f.seq > a[i - 1].seq));
const lastSeq = stdoutFrames.at(-1)?.seq ?? 0;

// --- Phase 2: disconnect (PTY must survive), then check the registry ---
c1.ws.close();
await wait(300);

const list = await fetch(`${HTTP_BASE}/api/sessions`).then((r) => r.json());
check("GET /api/sessions lists the detached session",
  list.sessions.some((s) => s.id === sessionId && s.attached === false));

// --- Phase 3: reconnect with same sessionId, resync from lastSeq ---
const c2 = await connect({ sessionId });
await wait(400);
const state2 = c2.frames.find((f) => f.type === "session_state");
check("reconnect reattaches to SAME session", state2?.sessionId === sessionId);

send(c2.ws, "resync", sessionId, { lastKnownSeq: 0 });
await wait(400);
const resync = c2.frames.find((f) => f.type === "resync");
check("resync response received", !!resync);
const replayed = c2.frames.filter((f) => f.type === "pty_stdout");
check("resync replays buffered chunks (seq > 0)",
  replayed.some((f) => f.seq <= lastSeq));
check("replayed buffer contains earlier output",
  stdoutText(c2.frames).includes("MMC_TEST_42"));

// Session still executes after resync
send(c2.ws, "pty_stdin", sessionId, "echo AFTER_RESYNC_OK");
await wait(1200);
check("session still executes after reconnect",
  stdoutText(c2.frames).includes("AFTER_RESYNC_OK"));

// --- Phase 4: bogus sessionId must NOT attach (defense in depth) ---
const c3 = await connect({ sessionId: "00000000-0000-4000-8000-000000000000" });
await wait(400);
const rejected = c3.frames.find(
  (f) => f.type === "session_state" && f.payload.status === "terminated"
);
const fresh = c3.frames.find(
  (f) => f.type === "session_state" && f.payload.status === "active"
);
check("unknown sessionId rejected, fresh session created",
  !!rejected && !!fresh && fresh.sessionId !== "00000000-0000-4000-8000-000000000000");

// --- Phase 5: sessions API create + kill (ROADMAP R2) ---
const created = await fetch(`${HTTP_BASE}/api/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "smoke-test" }),
}).then((r) => r.json());
check("POST /api/sessions creates a labeled session",
  created.session?.label === "smoke-test");

const killNoConfirm = await fetch(`${HTTP_BASE}/api/sessions/kill`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: created.session.id }),
});
check("kill without confirm is rejected (400)", killNoConfirm.status === 400);

const kill = await fetch(`${HTTP_BASE}/api/sessions/kill`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: created.session.id, confirm: true }),
});
check("kill with confirm succeeds", kill.status === 200);
await wait(200);
const list2 = await fetch(`${HTTP_BASE}/api/sessions`).then((r) => r.json());
check("killed session is gone from the registry",
  !list2.sessions.some((s) => s.id === created.session.id));

// --- Phase 6: push API exposes a VAPID key (ROADMAP R1) ---
const pushInfo = await fetch(`${HTTP_BASE}/api/push`).then((r) => r.json());
check("GET /api/push returns a VAPID public key",
  typeof pushInfo.publicKey === "string" && pushInfo.publicKey.length > 20);

// Cleanup: kill the sessions the test spawned.
for (const id of [sessionId, fresh?.sessionId].filter(Boolean)) {
  await fetch(`${HTTP_BASE}/api/sessions/kill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, confirm: true }),
  }).catch(() => {});
}

c2.ws.close();
c3.ws.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
