"use client";

// Connection sheet: which laptop this UI is bridged to, over which network,
// the state of the PTY sessions, and push-notification opt-in (ROADMAP R1).

import { useEffect, useState } from "react";
import { Bell, BellOff, Laptop, Wifi, TerminalSquare } from "lucide-react";
import Sheet from "@/components/sheet";
import { useAppStore, useActiveSession } from "@/store/app-store";
import {
  disablePush,
  enablePush,
  getPushState,
  type PushState,
} from "@/lib/push-client";

interface HostInfo {
  hostname: string;
  platform: string;
  user: string;
  networks: Array<{ iface: string; address: string }>;
  uptimeSec: number;
}

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  resyncing: "Resyncing…",
  disconnected: "Offline — will resume",
};

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ConnectionSheet({ onClose }: { onClose: () => void }) {
  const sessions = useAppStore((s) => s.sessions);
  const active = useActiveSession();
  const status = active?.status ?? "connecting";
  const [host, setHost] = useState<HostInfo | null>(null);
  const [hostError, setHostError] = useState(false);
  const [push, setPush] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/host")
      .then((r) => r.json())
      .then(setHost)
      .catch(() => setHostError(true));
    getPushState().then(setPush);
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (push === "subscribed") {
        await disablePush();
      } else {
        await enablePush();
      }
      setPush(await getPushState());
    } catch (err) {
      setPushError((err as Error).message);
      setPush(await getPushState());
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <Sheet title="Connection" onClose={onClose} bodyClassName="space-y-3">
      <>
          {/* Bridge status */}
          <div className="flex items-center gap-3 rounded-2xl bg-surface-soft p-4">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                status === "connected"
                  ? "bg-success"
                  : status === "disconnected"
                  ? "bg-danger"
                  : "bg-block-coral"
              }`}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{STATUS_LABEL[status]}</p>
              <p className="text-[12px] opacity-60">
                Encrypted bridge — compute stays on your laptop
              </p>
            </div>
          </div>

          {/* Notifications (ROADMAP R1) */}
          <div className="flex items-start gap-3 rounded-2xl border border-hairline p-4">
            {push === "subscribed" ? (
              <Bell size={20} className="mt-0.5 shrink-0" />
            ) : (
              <BellOff size={20} className="mt-0.5 shrink-0 opacity-60" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">Notifications</p>
              <p className="mt-0.5 text-[12px] opacity-60">
                {push === "unsupported"
                  ? "Not available here — on iPhone, install Beam to the Home Screen first."
                  : push === "denied"
                  ? "Blocked — allow notifications for Beam in system settings."
                  : "Get notified when an unwatched agent finishes or waits for input."}
              </p>
              {pushError && (
                <p className="mt-1 text-[12px] text-danger">{pushError}</p>
              )}
            </div>
            {(push === "subscribed" || push === "unsubscribed") && (
              <button
                onClick={togglePush}
                disabled={pushBusy}
                className={`shrink-0 rounded-pill px-4 py-2 text-[13px] font-medium disabled:opacity-40 ${
                  push === "subscribed"
                    ? "border border-hairline"
                    : "bg-primary text-on-primary"
                }`}
              >
                {pushBusy ? "…" : push === "subscribed" ? "Turn off" : "Turn on"}
              </button>
            )}
          </div>

          {/* Laptop */}
          <div className="flex items-start gap-3 rounded-2xl border border-hairline p-4">
            <Laptop size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">
                {host?.hostname ?? (hostError ? "Unavailable" : "…")}
              </p>
              {host && (
                <>
                  <p className="mt-0.5 text-[12px] opacity-60">{host.platform}</p>
                  <p className="text-[12px] opacity-60">
                    {host.user} · up {formatUptime(host.uptimeSec)}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Network */}
          <div className="flex items-start gap-3 rounded-2xl border border-hairline p-4">
            <Wifi size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">Network</p>
              {host?.networks.length ? (
                host.networks.map((n) => (
                  <p key={n.address} className="mt-0.5 font-mono text-[12px] opacity-70">
                    {n.iface} · {n.address}
                  </p>
                ))
              ) : (
                <p className="mt-0.5 text-[12px] opacity-60">
                  {host ? "No external IPv4 interface" : "…"}
                </p>
              )}
            </div>
          </div>

          {/* Sessions */}
          <div className="flex items-start gap-3 rounded-2xl border border-hairline p-4">
            <TerminalSquare size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">
                Sessions ({sessions.length})
              </p>
              {sessions.map((s) => (
                <p
                  key={s.id}
                  className="mt-0.5 truncate font-mono text-[12px] opacity-70"
                >
                  {s.id === active?.id ? "▸ " : ""}
                  {s.label} · {s.cwd}
                </p>
              ))}
            </div>
          </div>
      </>
    </Sheet>
  );
}
