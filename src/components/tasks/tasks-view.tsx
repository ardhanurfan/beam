"use client";

// Tasks tab: two subtabs —
//   Jira      — issues assigned to me (only when JIRA_* env is configured);
//               drill-in shows every field incl. the full description with
//               links/code, converted server-side from ADF to markdown.
//   My Tasks  — custom markdown task files in ~/.beam/tasks.
// Both kinds run through the same flow: review prompt → pick agent/skills/
// subagents → pick directory (required) → start a terminal session.

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import Sheet from "@/components/sheet";
import EditorSheet from "@/components/files/editor-sheet";
import MarkdownView from "@/components/markdown-view";
import RunTaskSheet from "@/components/tasks/run-task-sheet";

interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  statusCategory: "new" | "indeterminate" | "done";
  type: string;
  priority: string | null;
  epic: string | null;
  updated: string;
  url: string;
}

interface JiraIssueDetail extends JiraIssueSummary {
  labels: string[];
  reporter: string | null;
  descriptionMd: string;
}

interface CustomTask {
  name: string;
  title: string;
  path: string;
  updatedAt: number;
}

const STATUS_CHIP: Record<JiraIssueSummary["statusCategory"], string> = {
  new: "bg-surface-soft",
  indeterminate: "bg-block-lilac",
  done: "bg-block-mint",
};

function jiraPrompt(issue: JiraIssueDetail): string {
  const parts = [`Work on Jira issue ${issue.key}: ${issue.summary}`];
  if (issue.epic) parts.push(`Epic: ${issue.epic}`);
  if (issue.descriptionMd) parts.push(issue.descriptionMd);
  parts.push(`Jira link: ${issue.url}`);
  return parts.join("\n\n");
}

export default function TasksView() {
  const tab = useAppStore((s) => s.tab);

  // null = no explicit choice yet → default to Jira when it's configured.
  const [subtabChoice, setSubtabChoice] = useState<"jira" | "custom" | null>(null);
  const [jiraEnabled, setJiraEnabled] = useState<boolean | null>(null);
  const subtab = subtabChoice ?? (jiraEnabled ? "jira" : "custom");
  const [issues, setIssues] = useState<JiraIssueSummary[]>([]);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tasks, setTasks] = useState<CustomTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ path: string; content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomTask | null>(null);
  const [run, setRun] = useState<{ label: string; prompt: string } | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Jira list — also the "is Jira configured?" probe that decides whether
  // the Jira subtab exists at all.
  useEffect(() => {
    if (tab !== "tasks") return;
    let cancelled = false;
    fetch("/api/jira/issues")
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        setJiraEnabled(d.enabled === true);
        if (d.enabled && !d.error) {
          setIssues(d.issues ?? []);
          setError(null);
        } else if (d.error) {
          setError(d.error);
        }
        setIssuesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setJiraEnabled(false);
          setIssuesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, refreshTick]);

  // Custom task list
  useEffect(() => {
    if (tab !== "tasks") return;
    let cancelled = false;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => !cancelled && setTasks(d.tasks ?? []))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [tab, refreshTick]);

  async function openIssue(key: string) {
    setDetailLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/jira/issue?key=${encodeURIComponent(key)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d.issue);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function createNewTask() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCreating(false);
      setNewName("");
      setEditor({ path: d.task.path, content: `# ${d.task.title}\n\n` });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openTask(task: CustomTask) {
    setError(null);
    try {
      const r = await fetch(`/api/tasks/read?path=${encodeURIComponent(task.path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEditor({ path: task.path, content: d.content });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runTask(task: CustomTask) {
    setError(null);
    try {
      const r = await fetch(`/api/tasks/read?path=${encodeURIComponent(task.path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRun({ label: task.title, prompt: d.content.trim() });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const r = await fetch("/api/tasks/delete", {
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

  // ---- Jira issue drill-in ----
  if (detail || detailLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
          <button
            onClick={() => setDetail(null)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
            {detail?.key ?? "…"}
          </span>
          {detail && (
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Jira"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
            >
              <ExternalLink size={17} />
            </a>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!detail ? (
            <p className="py-6 text-center text-[14px] opacity-60">Loading issue…</p>
          ) : (
            <>
              <p className="text-[17px] font-bold leading-snug">{detail.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_CHIP[detail.statusCategory]}`}>
                  {detail.status}
                </span>
                <span className="rounded-pill border border-hairline px-2.5 py-1 text-[11px] font-medium">
                  {detail.type}
                </span>
                {detail.priority && (
                  <span className="rounded-pill border border-hairline px-2.5 py-1 text-[11px] font-medium">
                    {detail.priority}
                  </span>
                )}
                {detail.epic && (
                  <span className="rounded-pill bg-block-lilac px-2.5 py-1 text-[11px] font-medium">
                    Epic: {detail.epic}
                  </span>
                )}
                {detail.labels.map((l) => (
                  <span key={l} className="rounded-pill bg-block-cream px-2.5 py-1 text-[11px] font-medium">
                    {l}
                  </span>
                ))}
              </div>
              <div className="mt-5">
                {detail.descriptionMd ? (
                  <MarkdownView markdown={detail.descriptionMd} />
                ) : (
                  <p className="text-[14px] opacity-50">No description.</p>
                )}
              </div>
            </>
          )}
        </div>
        {detail && (
          <div className="shrink-0 border-t border-hairline bg-canvas px-4 py-3">
            <button
              onClick={() => setRun({ label: detail.key, prompt: jiraPrompt(detail) })}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-medium text-on-primary"
            >
              <Play size={16} />
              Run with agent
            </button>
          </div>
        )}
        {run && (
          <RunTaskSheet label={run.label} initialPrompt={run.prompt} onClose={() => setRun(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-6">
      {/* Subtab nav */}
      <div className="flex gap-2 px-4 pt-4">
        {jiraEnabled && (
          <button
            onClick={() => setSubtabChoice("jira")}
            className={`rounded-pill px-4 py-1.5 text-[13px] font-medium ${
              subtab === "jira" ? "bg-primary text-on-primary" : "border border-hairline bg-canvas"
            }`}
          >
            Jira
          </button>
        )}
        <button
          onClick={() => setSubtabChoice("custom")}
          className={`rounded-pill px-4 py-1.5 text-[13px] font-medium ${
            subtab === "custom" ? "bg-primary text-on-primary" : "border border-hairline bg-canvas"
          }`}
        >
          My Tasks
        </button>
        <button
          onClick={refresh}
          aria-label="Refresh"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <p className="wrap-anywhere mx-4 mt-3 rounded-md bg-block-pink px-3 py-2 text-[13px]">
          {error}
        </p>
      )}

      {/* ---- Jira subtab ---- */}
      {subtab === "jira" && jiraEnabled && (
        <div className="px-4 pt-3">
          <p className="eyebrow mb-2">Assigned to me ({issues.length})</p>
          {!issuesLoaded && <p className="py-4 text-[14px] opacity-60">Loading issues…</p>}
          {issuesLoaded && issues.length === 0 && !error && (
            <div className="rounded-[20px] bg-block-cream p-6 text-center">
              <p className="text-[14px] opacity-70">No open issues assigned to you.</p>
            </div>
          )}
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.key}>
                <button
                  onClick={() => openIssue(issue.key)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-hairline px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] font-semibold opacity-60">
                        {issue.key}
                      </span>
                      <span className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[issue.statusCategory]}`}>
                        {issue.status}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] font-medium">
                      {issue.summary}
                    </span>
                    {issue.epic && (
                      <span className="block truncate text-[11px] opacity-50">
                        {issue.epic}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={16} className="shrink-0 opacity-30" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Custom tasks subtab ---- */}
      {subtab === "custom" && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setCreating(true)}
            className="mb-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-pill border border-hairline text-[13px] font-medium"
          >
            <Plus size={15} /> New task
          </button>
          {tasks.length === 0 && (
            <div className="rounded-[20px] bg-block-cream p-6 text-center">
              <p className="text-[14px] opacity-70">
                No tasks yet. Each task is a markdown file — write what the
                agent should do, then run it.
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.path} className="flex items-center gap-1">
                <button
                  onClick={() => openTask(t)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{t.title}</span>
                    <span className="block truncate font-mono text-[11px] opacity-50">
                      {t.name}.md
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => runTask(t)}
                  aria-label={`Run ${t.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-block-lime active:opacity-80"
                >
                  <Play size={15} />
                </button>
                <button
                  onClick={() => setDeleteTarget(t)}
                  aria-label={`Delete ${t.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger/70 active:bg-surface-soft"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Editor (custom task markdown) */}
      {editor && (
        <EditorSheet
          path={editor.path}
          initialContent={editor.content}
          writeApi="/api/tasks/write"
          onClose={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}

      {/* New-task dialog */}
      {creating && (
        <Sheet
          title="New task"
          onClose={() => setCreating(false)}
          footer={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreating(false)}
                className="min-h-11 flex-1 rounded-pill border border-hairline px-4 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={createNewTask}
                disabled={busy || !newName.trim()}
                className="min-h-11 flex-1 rounded-pill bg-primary px-4 text-[14px] font-medium text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          }
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Task title"
            className="w-full rounded-xl border border-hairline px-3.5 py-3 text-[14px] outline-none focus:border-ink"
          />
          <p className="mt-2 text-[12px] opacity-60">
            Saved as markdown in <code className="font-mono">~/.beam/tasks/</code>, then
            opens in the editor.
          </p>
        </Sheet>
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
            <p className="text-[16px] font-semibold">Delete task?</p>
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

      {/* Run flow */}
      {run && (
        <RunTaskSheet label={run.label} initialPrompt={run.prompt} onClose={() => setRun(null)} />
      )}
    </div>
  );
}
