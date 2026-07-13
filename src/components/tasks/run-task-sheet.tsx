"use client";

// Run-a-task flow (Tasks tab): review the auto-composed prompt, optionally
// attach skills/subagents, pick the working directory (required) and the
// installed agent, then start a terminal session. The prompt is typed into
// the agent's TUI by the server once it finishes booting (initialInput).

import { useEffect, useMemo, useState } from "react";
import { Folder, Home, Play } from "lucide-react";
import Sheet from "@/components/sheet";
import { sessionHub } from "@/lib/ws-client";
import { useAppStore } from "@/store/app-store";

interface AgentStatus {
  id: string;
  name: string;
  bin: string;
  installed: boolean;
  skillsSupported: boolean;
}

interface SkillItem {
  type: "skill" | "subagent" | "prompt" | "command";
  name: string;
  path: string;
}

export default function RunTaskSheet({
  label,
  initialPrompt,
  onClose,
}: {
  /** Session tab label (issue key or task name). */
  label: string;
  initialPrompt: string;
  onClose: () => void;
}) {
  const roots = useAppStore((s) => s.roots);
  const setTab = useAppStore((s) => s.setTab);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selSkills, setSelSkills] = useState<Set<string>>(new Set());
  const [selSubagents, setSelSubagents] = useState<Set<string>>(new Set());
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Installed agents; default to Claude Code when present.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const installed = (d.agents ?? []).filter((a: AgentStatus) => a.installed);
        setAgents(installed);
        setAgentId(
          installed.some((a: AgentStatus) => a.id === "claude")
            ? "claude"
            : installed[0]?.id ?? null
        );
      })
      .catch(() => !cancelled && setError("Could not detect agents"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Skills/subagents follow the selected agent (selections are reset in
  // selectAgent, not here — effects only fetch).
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    fetch(`/api/skills?agent=${agentId}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setSkills(d.skills ?? []))
      .catch(() => !cancelled && setSkills([]));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const skillOptions = useMemo(
    () => dedupeByName(skills.filter((s) => s.type === "skill" || s.type === "command" || s.type === "prompt")),
    [skills]
  );
  const subagentOptions = useMemo(
    () => dedupeByName(skills.filter((s) => s.type === "subagent")),
    [skills]
  );

  const agent = agents.find((a) => a.id === agentId);
  const canStart = !busy && !!agent && !!dir && !!prompt.trim();

  function selectAgent(id: string) {
    setAgentId(id);
    setSelSkills(new Set());
    setSelSubagents(new Set());
  }

  async function start() {
    if (!agent || !dir || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    // Skills/subagents ride along as prompt lines, referenced by name — the
    // agent resolves them itself, so this works for every agent the same way.
    const parts = [prompt.trim()];
    if (selSkills.size) {
      parts.push(`Use these skills where relevant: ${[...selSkills].join(", ")}.`);
    }
    if (selSubagents.size) {
      parts.push(
        `Delegate to these subagents where appropriate: ${[...selSubagents].join(", ")}.`
      );
    }
    const id = await sessionHub.create({
      cwd: dir,
      command: agent.bin,
      label,
      initialInput: parts.join("\n\n"),
    });
    setBusy(false);
    if (!id) {
      setError("Could not start the session");
      return;
    }
    setTab("terminal");
    onClose();
  }

  return (
    <Sheet
      title={`Run: ${label}`}
      onClose={onClose}
      bodyClassName="space-y-4"
      footer={
        <button
          onClick={start}
          disabled={!canStart}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-medium text-on-primary disabled:opacity-40"
        >
          <Play size={16} />
          {busy ? "Starting…" : "Start session"}
        </button>
      }
    >
      {error && (
        <p className="wrap-anywhere rounded-md bg-block-pink px-3 py-2 text-[13px]">{error}</p>
      )}

      {/* Prompt — auto-composed, fully editable */}
      <div>
        <p className="eyebrow mb-1.5">Prompt</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          className="w-full resize-y rounded-xl border border-hairline px-3.5 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-ink"
        />
      </div>

      {/* Agent (required) */}
      <div>
        <p className="eyebrow mb-1.5">Agent</p>
        {agents.length === 0 && (
          <p className="text-[13px] opacity-60">No installed agents found.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => selectAgent(a.id)}
              className={`rounded-pill px-4 py-1.5 text-[13px] font-medium ${
                agentId === a.id
                  ? "bg-primary text-on-primary"
                  : "border border-hairline bg-canvas"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Directory (required) */}
      <div>
        <p className="eyebrow mb-1.5">
          Directory <span className="text-danger">*</span>
        </p>
        <ul className="space-y-1.5">
          {roots.map((r) => (
            <DirOption
              key={r.path}
              icon={<Folder size={16} className="shrink-0 opacity-70" />}
              name={r.name}
              path={r.path}
              selected={dir === r.path}
              onSelect={() => setDir(r.path)}
            />
          ))}
          <DirOption
            icon={<Home size={16} className="shrink-0 opacity-70" />}
            name="Home directory"
            path="~"
            selected={dir === "~"}
            onSelect={() => setDir("~")}
          />
        </ul>
      </div>

      {/* Skills (optional, multiple) */}
      {skillOptions.length > 0 && (
        <ChipMultiSelect
          title="Skills (optional)"
          options={skillOptions.map((s) => s.name)}
          selected={selSkills}
          onToggle={(name) => setSelSkills((prev) => toggle(prev, name))}
        />
      )}

      {/* Subagents (optional, multiple) */}
      {subagentOptions.length > 0 && (
        <ChipMultiSelect
          title="Subagents (optional)"
          options={subagentOptions.map((s) => s.name)}
          selected={selSubagents}
          onToggle={(name) => setSelSubagents((prev) => toggle(prev, name))}
        />
      )}
    </Sheet>
  );
}

function toggle(prev: Set<string>, name: string): Set<string> {
  const next = new Set(prev);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
}

function dedupeByName(items: SkillItem[]): SkillItem[] {
  const seen = new Set<string>();
  return items.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
}

function DirOption({
  icon,
  name,
  path,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  name: string;
  path: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${
          selected ? "border-ink bg-surface-soft" : "border-hairline"
        }`}
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate font-mono text-[11px] opacity-55">{path}</span>
        </span>
        <span
          className={`h-4 w-4 shrink-0 rounded-full border ${
            selected ? "border-ink bg-ink" : "border-hairline"
          }`}
        />
      </button>
    </li>
  );
}

function ChipMultiSelect({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((name) => (
          <button
            key={name}
            onClick={() => onToggle(name)}
            className={`rounded-pill px-3.5 py-1.5 text-[12px] font-medium ${
              selected.has(name)
                ? "bg-block-lime text-black"
                : "border border-hairline bg-canvas"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
