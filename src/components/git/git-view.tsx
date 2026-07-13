"use client";

// Source Control tab (PRD 3.2): status list → stacked diff per file,
// per-file discard (VSCode-style), Commit & Push, Stash, Panic Rollback.

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Undo2,
  GitCommitHorizontal,
  Archive,
  TriangleAlert,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { GitFileStatus } from "@/lib/types";
import { ROLLBACK_CONFIRM_TOKEN } from "@/lib/constants";
import StackedDiff from "@/components/git/stacked-diff";
import Sheet from "@/components/sheet";

const STATUS_BADGE: Record<
  GitFileStatus["status"],
  { label: string; cls: string }
> = {
  M: { label: "M", cls: "bg-block-lilac" },
  A: { label: "A", cls: "bg-block-mint" },
  D: { label: "D", cls: "bg-block-pink" },
  R: { label: "R", cls: "bg-block-cream" },
  U: { label: "U", cls: "bg-block-lime" },
  C: { label: "!", cls: "bg-block-coral" },
};

export default function GitView() {
  const roots = useAppStore((s) => s.roots);
  const tab = useAppStore((s) => s.tab);
  const actionLog = useAppStore((s) => s.actionLog);
  const pushActionLog = useAppStore((s) => s.pushActionLog);

  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [stashOpen, setStashOpen] = useState(false);
  const [panicStep, setPanicStep] = useState<0 | 1 | 2>(0);
  const [panicText, setPanicText] = useState("");
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const root = activeRoot ?? roots[0]?.path ?? null;
  const repoName = root?.split("/").pop() ?? "";

  function closePanic() {
    setPanicStep(0);
    setPanicText("");
  }

  // Status fetch re-runs on root change or manual refresh tick.
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    // The view stays mounted across tab switches — refetch on every
    // entry into the Source Control tab, not just on mount.
    if (!root || tab !== "git") return;
    let cancelled = false;
    fetch(`/api/git/status?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!cancelled) {
          setFiles(d.files);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setFiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [root, refreshTick, tab]);

  async function showDiff(file: string) {
    if (!root) return;
    setOpenFile(file);
    setDiff(null);
    try {
      const r = await fetch(
        `/api/git/diff?root=${encodeURIComponent(root)}&file=${encodeURIComponent(file)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDiff(d.diff);
    } catch (err) {
      setDiff(`error: ${(err as Error).message}`);
    }
  }

  async function doCommit(push: boolean) {
    if (!root || !commitMsg.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, message: commitMsg, push }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pushActionLog(
        `✓ commit${d.pushed ? " + push" : push ? " (push failed)" : " (local only)"}: ${commitMsg}`,
      );
      d.log
        .split("\n")
        .filter(Boolean)
        .forEach((l: string) => pushActionLog(l));
      setCommitOpen(false);
      setCommitMsg("");
      refresh();
    } catch (err) {
      pushActionLog(`✗ commit failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function quickStash() {
    if (!root) return;
    setBusy(true);
    try {
      const r = await fetch("/api/git/stash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pushActionLog(`✓ stash: ${d.log.trim()}`);
      setStashOpen(false);
      refresh();
    } catch (err) {
      pushActionLog(`✗ stash failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function discardFile(path: string) {
    if (!root) return;
    setBusy(true);
    try {
      const r = await fetch("/api/git/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, path, confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pushActionLog(`✓ ${d.log.trim()}`);
      setDiscardTarget(null);
      if (openFile === path) setOpenFile(null);
      refresh();
    } catch (err) {
      pushActionLog(`✗ discard failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function panicRollback() {
    if (!root) return;
    setBusy(true);
    try {
      const r = await fetch("/api/git/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, confirm: ROLLBACK_CONFIRM_TOKEN }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pushActionLog("✓ panic rollback: working tree reset to HEAD");
      closePanic();
      setOpenFile(null);
      refresh();
    } catch (err) {
      pushActionLog(`✗ rollback failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (roots.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-[20px] bg-block-lime p-8 text-center">
          <p className="eyebrow mb-3">Source control</p>
          <p className="text-[15px]">Open a folder first to review changes.</p>
        </div>
      </div>
    );
  }

  // ---- Diff drill-in view ----
  if (openFile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
          <button
            onClick={() => setOpenFile(null)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
            {openFile}
          </span>
          <button
            onClick={() => setDiscardTarget(openFile)}
            aria-label="Discard changes in this file"
            className="flex h-9 w-9 items-center justify-center rounded-full text-danger active:bg-surface-soft"
          >
            <Undo2 size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {diff === null ? (
            <p className="py-6 text-center text-[14px]">Loading diff…</p>
          ) : (
            <StackedDiff diff={diff} />
          )}
        </div>
        {discardTarget && (
          <DiscardDialog
            path={discardTarget}
            busy={busy}
            onCancel={() => setDiscardTarget(null)}
            onConfirm={() => discardFile(discardTarget)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Multi-root selector (FR-3.4.3 aware) */}
        {roots.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
            {roots.map((r) => (
              <button
                key={r.path}
                onClick={() => setActiveRoot(r.path)}
                className={`shrink-0 rounded-pill px-4 py-1.5 text-[13px] font-medium ${
                  root === r.path
                    ? "bg-primary text-on-primary"
                    : "border border-hairline bg-canvas"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Changes ({files.length})</p>
            <button
              onClick={refresh}
              aria-label="Refresh"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && <p className="py-2 text-[13px] text-danger">{error}</p>}
          {files.length === 0 && !error && (
            <p className="py-6 text-center text-[14px] opacity-60">
              Working tree clean
            </p>
          )}
          <ul className="divide-y divide-hairline-soft">
            {files.map((f) => (
              <li key={f.path} className="flex items-center gap-1">
                <button
                  onClick={() => showDiff(f.path)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-left"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${STATUS_BADGE[f.status].cls}`}
                  >
                    {STATUS_BADGE[f.status].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                    {f.path}
                  </span>
                  <ChevronRight size={16} className="shrink-0 opacity-30" />
                </button>
                {/* Per-file discard, VSCode-style */}
                <button
                  onClick={() => setDiscardTarget(f.path)}
                  aria-label={`Discard changes in ${f.path}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger/70 active:bg-surface-soft"
                >
                  <Undo2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Action log strip (FR-3.2.3 real-time output) */}
        {actionLog.length > 0 && (
          <div className="mx-4 mb-3 max-h-40 overflow-y-auto rounded-xl bg-block-navy p-3 font-mono text-[11px] leading-relaxed text-inverse-ink">
            {actionLog.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap wrap-break-word">
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions (thumb zone) */}
      <div className="flex shrink-0 gap-2 border-t border-hairline bg-canvas px-4 py-3">
        <button
          onClick={() => setCommitOpen(true)}
          disabled={files.length === 0}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-4 text-[14px] font-medium text-on-primary disabled:opacity-40"
        >
          <GitCommitHorizontal size={17} />
          Commit &amp; Push
        </button>
        <button
          onClick={() => setStashOpen(true)}
          disabled={files.length === 0 || busy}
          aria-label="Stash changes (recoverable)"
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-pill border border-hairline px-3.5 text-[12px] font-medium disabled:opacity-40"
        >
          <Archive size={16} />
          Stash
        </button>
        <button
          onClick={() => setPanicStep(1)}
          disabled={files.length === 0}
          aria-label="Panic rollback (destructive)"
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-block-coral px-3.5 text-[12px] font-medium disabled:opacity-40"
        >
          <TriangleAlert size={16} />
          Rollback
        </button>
      </div>

      {/* Commit modal (FR-3.2.3) */}
      {commitOpen && (
        <Sheet
          title="Commit & push"
          onClose={() => setCommitOpen(false)}
          footer={
            <div className="flex items-center gap-2">
              <button
                onClick={() => doCommit(false)}
                disabled={busy || !commitMsg.trim()}
                className="min-h-11 flex-1 rounded-pill border border-hairline px-4 text-[14px] font-medium disabled:opacity-40"
              >
                {busy ? "…" : "Commit"}
              </button>
              <button
                onClick={() => doCommit(true)}
                disabled={busy || !commitMsg.trim()}
                className="min-h-11 flex-1 rounded-pill bg-primary px-4 text-[14px] font-medium text-on-primary disabled:opacity-40"
              >
                {busy ? "Running…" : "Commit & Push"}
              </button>
            </div>
          }
        >
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            rows={3}
            placeholder="Commit message"
            className="w-full rounded-xl border border-hairline px-3.5 py-3 text-[15px] outline-none focus:border-ink"
          />
        </Sheet>
      )}

      {/* Per-file discard confirmation */}
      {discardTarget && (
        <DiscardDialog
          path={discardTarget}
          busy={busy}
          onCancel={() => setDiscardTarget(null)}
          onConfirm={() => discardFile(discardTarget)}
        />
      )}

      {/* Quick Stash — light confirmation (FR-3.2.4, non-destructive) */}
      {stashOpen && (
        <Sheet
          title="Quick stash"
          onClose={() => setStashOpen(false)}
          footer={
            <div className="flex flex-col gap-2">
              <button
                onClick={quickStash}
                disabled={busy}
                className="h-12 w-full whitespace-nowrap rounded-pill bg-primary text-[15px] font-medium text-on-primary disabled:opacity-40"
              >
                {busy ? "Stashing…" : "Stash changes"}
              </button>
              <button
                onClick={() => setStashOpen(false)}
                className="h-12 w-full whitespace-nowrap rounded-pill border border-hairline text-[15px] font-medium"
              >
                Cancel
              </button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed">
            Saves all {files.length} changed file{files.length === 1 ? "" : "s"}{" "}
            (including untracked) to the git stash and cleans the working
            tree. Recoverable anytime with{" "}
            <code className="font-mono text-[12px]">git stash pop</code>.
          </p>
        </Sheet>
      )}

      {/* Panic Rollback — three gates (FR-3.2.5): button → warning sheet →
          type-to-confirm. The 2026-07-12 incident is why the third exists. */}
      {panicStep === 1 && (
        <Sheet
          title="Panic rollback"
          variant="coral"
          onClose={closePanic}
          footer={
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setPanicStep(2)}
                className="h-12 w-full whitespace-nowrap rounded-pill bg-danger text-[15px] font-semibold text-white"
              >
                Continue
              </button>
              <button
                onClick={closePanic}
                className="h-12 w-full whitespace-nowrap rounded-pill bg-canvas text-[15px] font-medium"
              >
                Keep my changes
              </button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed">
            This will <strong>discard ALL uncommitted changes</strong> (
            <code className="font-mono text-[12px]">
              git checkout -- . &amp;&amp; git clean -fd
            </code>
            ), including untracked files. This cannot be undone. Continue?
          </p>
        </Sheet>
      )}
      {panicStep === 2 && (
        <Sheet
          title="Type to confirm"
          variant="coral"
          onClose={closePanic}
          footer={
            <div className="flex flex-col gap-2">
              <button
                onClick={panicRollback}
                disabled={busy || panicText !== repoName}
                className="h-12 w-full whitespace-nowrap rounded-pill bg-danger text-[15px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Rolling back…" : "Discard everything"}
              </button>
              <button
                onClick={closePanic}
                className="h-12 w-full whitespace-nowrap rounded-pill bg-canvas text-[15px] font-medium"
              >
                Cancel
              </button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed">
            Type <strong className="font-mono">{repoName}</strong> to confirm
            discarding everything in this repository.
          </p>
          <input
            value={panicText}
            onChange={(e) => setPanicText(e.target.value)}
            placeholder={repoName}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-3 w-full rounded-xl border border-hairline bg-canvas px-3.5 py-3 font-mono text-[14px] outline-none focus:border-ink"
          />
        </Sheet>
      )}
    </div>
  );
}

function DiscardDialog({
  path,
  busy,
  onCancel,
  onConfirm,
}: {
  path: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-[20px] bg-canvas p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-semibold">Discard changes?</p>
        <p className="mt-1 break-all font-mono text-[12px] opacity-70">
          {path}
        </p>
        <p className="mt-2 text-[14px] opacity-70">
          Changes in this file will be reverted to HEAD (untracked files are
          deleted). This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-pill border border-hairline px-5 py-2.5 text-[14px] font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-pill bg-danger px-5 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {busy ? "Discarding…" : "Discard"}
          </button>
        </div>
      </div>
    </div>
  );
}
