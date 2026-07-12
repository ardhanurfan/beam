// Web Push plumbing (ROADMAP R1).
//
// VAPID keys are generated once and persisted with the subscriptions in
// ~/.beam/push.json, so notifications keep working across server restarts
// with zero configuration. Everything stays on the laptop — the only
// external party is the browser's own push service, which carries the
// (payload-encrypted) notification to the phone.

import webpush, { type PushSubscription } from "web-push";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STORE_PATH = path.join(os.homedir(), ".beam", "push.json");
// Push services require a mailto:/https: subject identifying the operator.
const SUBJECT = process.env.MMC_PUSH_SUBJECT ?? "mailto:beam@example.com";

interface PushStore {
  publicKey: string;
  privateKey: string;
  subscriptions: PushSubscription[];
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

class PushManager {
  private store: PushStore;

  constructor() {
    this.store = this.load();
    webpush.setVapidDetails(SUBJECT, this.store.publicKey, this.store.privateKey);
  }

  getPublicKey(): string {
    return this.store.publicKey;
  }

  subscriptionCount(): number {
    return this.store.subscriptions.length;
  }

  addSubscription(sub: PushSubscription): void {
    if (this.store.subscriptions.some((s) => s.endpoint === sub.endpoint)) return;
    this.store.subscriptions.push(sub);
    this.save();
  }

  removeSubscription(endpoint: string): void {
    const before = this.store.subscriptions.length;
    this.store.subscriptions = this.store.subscriptions.filter(
      (s) => s.endpoint !== endpoint
    );
    if (this.store.subscriptions.length !== before) this.save();
  }

  /** Send to every subscribed device; prune subscriptions the push service rejects. */
  async notifyAll(payload: PushPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const dead: string[] = [];
    await Promise.all(
      this.store.subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, body);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.endpoint);
          else console.error("push send failed:", err);
        }
      })
    );
    for (const endpoint of dead) this.removeSubscription(endpoint);
  }

  private load(): PushStore {
    try {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as PushStore;
      if (raw.publicKey && raw.privateKey) {
        return { ...raw, subscriptions: raw.subscriptions ?? [] };
      }
    } catch {
      /* first run or corrupt file — regenerate below */
    }
    const keys = webpush.generateVAPIDKeys();
    const fresh: PushStore = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subscriptions: [],
    };
    this.persist(fresh);
    return fresh;
  }

  private save(): void {
    this.persist(this.store);
  }

  private persist(store: PushStore): void {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  }
}

// Singleton across the whole Node process (custom server + Next runtime).
const g = globalThis as unknown as { __mmcPushManager?: PushManager };
export const pushManager: PushManager =
  g.__mmcPushManager ?? (g.__mmcPushManager = new PushManager());
