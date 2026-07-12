"use client";

// File Explorer (PRD 3.3 + 3.4): multi-root tree, one directory level per
// request (FR-3.3.1), expand-on-tap with per-path cache, tap file → editor.

import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FileText } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { TreeEntry } from "@/lib/types";
import EditorSheet from "@/components/files/editor-sheet";

export default function FilesView() {
  const roots = useAppStore((s) => s.roots);
  // Per-path cache — a directory is fetched once per session (FR-3.3.1).
  const [children, setChildren] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ path: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleDir(path: string) {
    if (expanded[path]) {
      setExpanded((e) => ({ ...e, [path]: false }));
      return;
    }
    setExpanded((e) => ({ ...e, [path]: true }));
    if (children[path]) return; // cache hit — no refetch
    try {
      const r = await fetch(`/api/fs/tree?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setChildren((c) => ({ ...c, [path]: d.entries }));
    } catch (err) {
      setError((err as Error).message);
      setExpanded((e) => ({ ...e, [path]: false }));
    }
  }

  async function openFile(path: string) {
    setError(null);
    try {
      const r = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setViewer({ path, content: d.content });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function renderLevel(path: string, depth: number) {
    const entries = children[path];
    if (!entries) {
      return (
        <p className="py-1 text-[13px] opacity-50" style={{ paddingLeft: depth * 16 + 16 }}>
          Loading…
        </p>
      );
    }
    if (entries.length === 0) {
      return (
        <p className="py-1 text-[13px] opacity-50" style={{ paddingLeft: depth * 16 + 16 }}>
          (empty)
        </p>
      );
    }
    return entries.map((e) => (
      <div key={e.path}>
        <button
          onClick={() => (e.type === "dir" ? toggleDir(e.path) : openFile(e.path))}
          className="flex min-h-10 w-full items-center gap-2 py-1 text-left active:bg-surface-soft"
          style={{ paddingLeft: depth * 16 + 16 }}
        >
          {e.type === "dir" ? (
            <>
              {expanded[e.path] ? (
                <ChevronDown size={15} className="shrink-0 opacity-50" />
              ) : (
                <ChevronRight size={15} className="shrink-0 opacity-50" />
              )}
              <Folder size={16} className="shrink-0" />
            </>
          ) : (
            <FileText size={16} className="ml-[19px] shrink-0 opacity-60" />
          )}
          <span className={`truncate text-[14px] ${e.type === "dir" ? "font-medium" : ""}`}>
            {e.name}
          </span>
        </button>
        {e.type === "dir" && expanded[e.path] && renderLevel(e.path, depth + 1)}
      </div>
    ));
  }

  if (roots.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-[20px] bg-block-cream p-8 text-center">
          <p className="eyebrow mb-3">Files</p>
          <p className="text-[15px]">
            Open a folder or workspace from the header to browse it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-4">
      {error && (
        <p className="mx-4 mt-3 rounded-xl bg-block-pink px-3 py-2 text-[13px]">{error}</p>
      )}
      {/* FR-3.4.3 — every workspace folder is a separate top-level root node */}
      {roots.map((root) => (
        <div key={root.path} className="mt-3">
          <button
            onClick={() => toggleDir(root.path)}
            className="flex min-h-11 w-full items-center gap-2 px-4 text-left"
          >
            {expanded[root.path] ? (
              <ChevronDown size={15} className="shrink-0 opacity-50" />
            ) : (
              <ChevronRight size={15} className="shrink-0 opacity-50" />
            )}
            <span className="eyebrow rounded-md bg-block-lilac px-2 py-1.5">
              {root.name}
            </span>
          </button>
          {expanded[root.path] && renderLevel(root.path, 1)}
        </div>
      ))}

      {/* Mini-editor (FR-3.3.3): CodeMirror, explicit save */}
      {viewer && (
        <EditorSheet
          path={viewer.path}
          initialContent={viewer.content}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
