"use client";

// Bottom tab bar — classic mobile app style: icon with a small label
// underneath, active tab in ink, inactive tabs muted.

import { Terminal, GitBranch, FolderOpen, Bot } from "lucide-react";
import { useAppStore, type Tab } from "@/store/app-store";

const TABS: Array<{ id: Tab; label: string; Icon: typeof Terminal }> = [
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "git", label: "Source", Icon: GitBranch },
  { id: "files", label: "Files", Icon: FolderOpen },
  { id: "agents", label: "Agents", Icon: Bot },
];

export default function BottomNav() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <nav className="shrink-0 border-t border-hairline bg-canvas pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
      <div className="flex items-stretch justify-around">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-ink" : "text-ink/35"
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
