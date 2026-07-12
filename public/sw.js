// Minimal service worker for PWA installability + offline app shell.
// The app itself is useless offline (it's a live bridge), so we only keep
// the shell cached to satisfy install criteria and show the UI instantly.
// Also handles Web Push (ROADMAP R1): the laptop notifies this device when
// an unwatched agent session finishes or waits for input.
const CACHE = "beam-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON push — show a generic notification below */
  }
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || "Beam", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // One visible notification per session — newer replaces older.
      tag: data.sessionId || "beam",
      data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const win of wins) {
          if ("focus" in win) return win.focus();
        }
        return self.clients.openWindow("/");
      })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Network-first for navigations; cached shell as offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/"))
    );
  }
});
