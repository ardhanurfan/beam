"use client";

// Client state (PRD 2.2 — State Client: Zustand).
import { create } from "zustand";
import type { WorkspaceRoot } from "@/lib/types";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "resyncing"
  | "disconnected";

export type Tab = "terminal" | "git" | "files" | "agents";

/** One live PTY session on the laptop (ROADMAP R2). */
export interface SessionMeta {
  id: string;
  label: string;
  cwd: string;
  startedAt: number;
  status: ConnectionStatus;
  /** True when the server told us output was lost (buffer overrun). */
  missedOutput: boolean;
}

interface AppState {
  // Sessions
  sessions: SessionMeta[];
  activeSessionId: string | null;

  // Workspace
  workspaceFile: string | null;
  roots: WorkspaceRoot[];

  // UI
  tab: Tab;
  /** Log strip lines for quick-action output (FR-3.2.3). */
  actionLog: string[];

  upsertSession: (meta: SessionMeta) => void;
  patchSession: (id: string, patch: Partial<SessionMeta>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  setWorkspace: (file: string | null, roots: WorkspaceRoot[]) => void;
  setTab: (tab: Tab) => void;
  pushActionLog: (line: string) => void;
  clearActionLog: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  workspaceFile: null,
  roots: [],
  tab: "terminal",
  actionLog: [],

  upsertSession: (meta) =>
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === meta.id);
      const sessions =
        idx >= 0
          ? s.sessions.map((x, i) => (i === idx ? { ...x, ...meta } : x))
          : [...s.sessions, meta].sort((a, b) => a.startedAt - b.startedAt);
      return { sessions };
    }),
  patchSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  setWorkspace: (workspaceFile, roots) => set({ workspaceFile, roots }),
  setTab: (tab) => set({ tab }),
  pushActionLog: (line) =>
    set((s) => ({ actionLog: [...s.actionLog.slice(-199), line] })),
  clearActionLog: () => set({ actionLog: [] }),
}));

/** The session the UI is focused on (header dot, prompt bar target). */
export function useActiveSession(): SessionMeta | undefined {
  const sessions = useAppStore((s) => s.sessions);
  const activeId = useAppStore((s) => s.activeSessionId);
  return sessions.find((x) => x.id === activeId);
}
