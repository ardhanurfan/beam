"use client";

// Agents tab: detect installed AI coding agents, launch one into the
// terminal, and manage each agent's skills / subagents / prompts.

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { sessionHub } from "@/lib/ws-client";
import EditorSheet from "@/components/files/editor-sheet";

interface AgentStatus {
  id: string;
  name: string;
  bin: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  skillsSupported: boolean;
}

interface SkillItem {
  agentId: string;
  source: string;
  type: "skill" | "subagent" | "prompt" | "command";
  scope: "global" | "project";
  name: string;
  path: string;
  description: string | null;
}

const TYPE_BADGE: Record<SkillItem["type"], string> = {
  skill: "bg-block-lime",
  subagent: "bg-block-lilac",
  prompt: "bg-block-mint",
  command: "bg-block-cream",
};

const NEW_SKILL_TEMPLATE = (name: string) => `---
name: ${name}
description: What this skill does and when to use it.
---

# ${name}

Instructions for the agent go here.
`;

const NEW_SUBAGENT_TEMPLATE = (name: string) => `---
name: ${name}
description: When this subagent should be used.
---

You are a specialized subagent. Describe the role, constraints, and
expected output here.
`;

export default function AgentsView() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selected, setSelected] = useState<string>("claude");
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ path: string; content: string } | null>(null);
  const [creating, setCreating] = useState<null | "skill" | "subagent">(null);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SkillItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Detect agents when the tab is opened (kept mounted across switches).
  useEffect(() => {
    if (tab !== "agents") return;
    let cancelled = false;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setAgents(d.agents ?? []);
          setAgentsLoaded(true);
        }
      })
      .catch(() => !cancelled && setError("Could not detect agents"));
    return () => {
      cancelled = true;
    };
  }, [tab, refreshTick]);

  useEffect(() => {
    if (tab !== "agents") return;
    let cancelled = false;
    fetch(`/api/skills?agent=${selected}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setSkills(d.skills ?? []))
      .catch(() => !cancelled && setSkills([]));
    return () => {
      cancelled = true;
    };
  }, [tab, selected, refreshTick]);

  function launch(agent: AgentStatus) {
    // Each launch gets its own PTY session (ROADMAP R2) so agents can run
    // side by side; the session tab is named after the agent. No cwd —
    // the server opens it in the active workspace root.
    void sessionHub.create({ command: agent.bin, label: agent.name });
    setTab("terminal");
  }

  async function openSkill(item: SkillItem) {
    setError(null);
    try {
      const r = await fetch(`/api/skills/read?path=${encodeURIComponent(item.path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEditor({ path: item.path, content: d.content });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createSkill() {
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || !creating) return;
    setBusy(true);
    setError(null);
    // "~" is expanded to the laptop's home dir server-side.
    const path =
      creating === "skill"
        ? `~/.claude/skills/${slug}/SKILL.md`
        : `~/.claude/agents/${slug}.md`;
    const content =
      creating === "skill" ? NEW_SKILL_TEMPLATE(slug) : NEW_SUBAGENT_TEMPLATE(slug);
    try {
      const r = await fetch("/api/skills/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCreating(null);
      setNewName("");
      setEditor({ path: d.path, content });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const r = await fetch("/api/skills/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: deleteTarget.path, confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const skillAgents = agents.filter((a) => a.skillsSupported);
  const selectedAgent = agents.find((a) => a.id === selected);

  return (
    <div className="h-full overflow-y-auto pb-6">
      {/* Installed agents */}
      <div className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Agents</p>
          <button
            onClick={refresh}
            aria-label="Refresh agents"
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {!agentsLoaded && <p className="py-4 text-[14px] opacity-60">Detecting agents…</p>}
        <ul className="space-y-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-hairline p-3"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  a.installed ? "bg-block-lime" : "bg-surface-soft"
                }`}
              >
                <Bot size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{a.name}</p>
                <p className="truncate font-mono text-[11px] opacity-50">
                  {a.installed ? a.version ?? a.path : "not installed"}
                </p>
              </div>
              {a.installed && (
                <button
                  onClick={() => launch(a)}
                  className="flex h-9 items-center gap-1.5 rounded-pill bg-primary px-3.5 text-[13px] font-medium text-on-primary"
                >
                  <Play size={14} />
                  Run
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Skills management */}
      <div className="mt-6 px-4">
        <p className="eyebrow mb-2">Skills &amp; extensions</p>
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
          {skillAgents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`shrink-0 rounded-pill px-4 py-1.5 text-[13px] font-medium ${
                selected === a.id
                  ? "bg-primary text-on-primary"
                  : "border border-hairline bg-canvas"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {error && <p className="mb-2 rounded-md bg-block-pink px-3 py-2 text-[13px]">{error}</p>}

        {selected === "claude" && (
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setCreating("skill")}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-pill border border-hairline text-[13px] font-medium"
            >
              <Plus size={15} /> New skill
            </button>
            <button
              onClick={() => setCreating("subagent")}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-pill border border-hairline text-[13px] font-medium"
            >
              <Plus size={15} /> New subagent
            </button>
          </div>
        )}

        {skills.length === 0 && (
          <div className="rounded-[20px] bg-block-cream p-6 text-center">
            <Sparkles size={20} className="mx-auto mb-2 opacity-60" />
            <p className="text-[14px] opacity-70">
              No {selectedAgent?.name ?? "agent"} skills found
              {selectedAgent?.installed === false ? " (agent not installed)" : ""}.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {skills.map((s) => (
            <li key={s.path} className="flex items-center gap-1">
              <button
                onClick={() => openSkill(s)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-left"
              >
                <span
                  className={`eyebrow shrink-0 rounded-sm px-1.5 py-1 ${TYPE_BADGE[s.type]}`}
                >
                  {s.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{s.name}</span>
                  <span className="block truncate text-[12px] opacity-55">
                    {s.description ?? s.source}
                    {s.scope === "project" ? " · project" : ""}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 opacity-30" />
              </button>
              <button
                onClick={() => setDeleteTarget(s)}
                aria-label={`Delete ${s.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger/70 active:bg-surface-soft"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Skill editor */}
      {editor && (
        <EditorSheet
          path={editor.path}
          initialContent={editor.content}
          writeApi="/api/skills/write"
          onClose={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}

      {/* Create dialog */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setCreating(null)}
        >
          <div className="sheet bg-canvas" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow mb-4">
              New {creating === "skill" ? "skill" : "subagent"} (global)
            </p>
            <div className="sheet-scroll">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={creating === "skill" ? "my-skill-name" : "my-subagent-name"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-xl border border-hairline px-3.5 py-3 font-mono text-[14px] outline-none focus:border-ink"
              />
              <p className="mt-2 text-[12px] opacity-60">
                Created in{" "}
                <code className="font-mono">
                  ~/.claude/{creating === "skill" ? "skills/<name>/SKILL.md" : "agents/<name>.md"}
                </code>
                , then opens in the editor.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCreating(null)}
                className="rounded-pill border border-hairline px-5 py-2.5 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={createSkill}
                disabled={busy || !newName.trim()}
                className="rounded-pill bg-primary px-5 py-2.5 text-[14px] font-medium text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] bg-canvas p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16px] font-semibold">Delete {deleteTarget.type}?</p>
            <p className="mt-1 break-all font-mono text-[12px] opacity-70">
              {deleteTarget.path}
            </p>
            <p className="mt-2 text-[14px] opacity-70">This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-pill border border-hairline px-5 py-2.5 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={busy}
                className="rounded-pill bg-danger px-5 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
