"use client";

// Web Push subscription flow on the phone (ROADMAP R1).
// iOS note: PushManager only exists in a PWA installed to the home screen
// (iOS 16.4+); in the plain browser tab the toggle reports "unsupported".

export type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    // sw-register.tsx only registers the service worker on https — without
    // it, pushManager.subscribe/ready would hang on plain-http dev hosts.
    location.protocol === "https:" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Push is not supported here");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission denied");

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await fetch("/api/push").then((r) => r.json());
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!r.ok) throw new Error("Failed to register subscription");
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
