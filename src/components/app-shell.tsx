"use client";

// Single-page shell: the WebSocket session must survive tab switches, so
// Terminal / Source Control / Files are tabs in one client tree, not routes.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppStore, useActiveSession } from "@/store/app-store";
import { sessionHub } from "@/lib/ws-client";
import { useKeyboardOffset } from "@/components/floating-toolbar";
import Logo from "@/components/logo";
import WorkspacePicker from "@/components/workspace-picker";
import ConnectionSheet from "@/components/connection-sheet";
import BottomNav from "@/components/bottom-nav";
import TerminalView from "@/components/terminal/terminal-view";
import GitView from "@/components/git/git-view";
import FilesView from "@/components/files/files-view";
import TasksView from "@/components/tasks/tasks-view";
import AgentsView from "@/components/agents/agents-view";

export default function AppShell() {
  const tab = useAppStore((s) => s.tab);
  const active = useActiveSession();
  const patchSession = useAppStore((s) => s.patchSession);
  const status = active?.status ?? "connecting";
  const missedOutput = active?.missedOutput ?? false;

  const [connectionOpen, setConnectionOpen] = useState(false);

  useEffect(() => {
    sessionHub.start();
  }, []);

  // iOS doesn't shrink the layout viewport for the keyboard — it scroll-jumps
  // the page instead, leaving dead space. Shrink the shell to the visual
  // viewport ourselves (which also re-fits xterm to fewer rows) and pin the
  // page back to the top.
  const keyboardOffset = useKeyboardOffset();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [keyboardOffset]);

  return (
    <div
      className="flex h-dvh flex-col"
      style={
        keyboardOffset > 0
          ? { height: `calc(100dvh - ${keyboardOffset}px)` }
          : undefined
      }
    >
      {/* Top chrome — logo, tappable status dot, workspace picker */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline bg-canvas px-4">
        <Logo size={28} />
        <button
          onClick={() => setConnectionOpen(true)}
          className="flex min-w-0 items-center gap-2"
          aria-label="Connection details"
        >
          <span className="truncate text-[17px] font-semibold tracking-[-0.3px]">
            Beam
          </span>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              status === "connected"
                ? "bg-success"
                : status === "disconnected"
                ? "bg-danger"
                : "animate-pulse bg-block-coral"
            }`}
          />
        </button>
        <div className="ml-auto">
          <WorkspacePicker />
        </div>
      </header>

      {/* Missed-output banner (resync truncated, PRD Section 4) */}
      {missedOutput && active && (
        <button
          onClick={() => patchSession(active.id, { missedOutput: false })}
          className="flex items-center gap-2 bg-block-lilac px-4 py-2 text-left text-[13px]"
        >
          <span className="flex-1">
            Some output was missed while offline — synced to the latest state.
          </span>
          <X size={14} className="shrink-0" />
        </button>
      )}

      {/* All tabs stay MOUNTED and are toggled via CSS — unmounting the
          terminal would destroy the xterm instance and blank the screen. */}
      <main className="min-h-0 flex-1">
        <div className={tab === "terminal" ? "h-full" : "hidden"}>
          <TerminalView />
        </div>
        <div className={tab === "git" ? "h-full" : "hidden"}>
          <GitView />
        </div>
        <div className={tab === "files" ? "h-full" : "hidden"}>
          <FilesView />
        </div>
        <div className={tab === "tasks" ? "h-full" : "hidden"}>
          <TasksView />
        </div>
        <div className={tab === "agents" ? "h-full" : "hidden"}>
          <AgentsView />
        </div>
      </main>

      <BottomNav />

      {connectionOpen && <ConnectionSheet onClose={() => setConnectionOpen(false)} />}
    </div>
  );
}
