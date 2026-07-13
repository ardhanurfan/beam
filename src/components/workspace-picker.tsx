"use client";

// Workspace picker (FR-3.4.1 + plain-folder support):
// - Lists discovered *.code-workspace files (multi-root, FR-3.4.2)
// - AND lets the user browse the home subtree and open ANY folder as a
//   single-root workspace — no .code-workspace file required.

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
} from "lucide-react";
import Sheet from "@/components/sheet";
import { useAppStore } from "@/store/app-store";
import type { WorkspaceRoot } from "@/lib/types";

interface BrowseEntry {
  name: string;
  path: string;
}

interface BrowseState {
  path: string;
  parent: string | null;
  dirs: BrowseEntry[];
  workspaceFiles: BrowseEntry[];
}

export default function WorkspacePicker() {
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [discovered, setDiscovered] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceFile = useAppStore((s) => s.workspaceFile);
  const setWorkspace = useAppStore((s) => s.setWorkspace);

  // Restore server-side active workspace on mount (survives page reloads).
  useEffect(() => {
    fetch("/api/workspace/active")
      .then((r) => r.json())
      .then((d: { source: string | null; roots: WorkspaceRoot[] }) => {
        if (d.source) setWorkspace(d.source, d.roots);
      })
      .catch(() => {});
  }, [setWorkspace]);

  async function openPicker() {
    setOpen(true);
    setError(null);
    setLoading(true);
    try {
      const [listRes, browseRes] = await Promise.all([
        fetch("/api/workspace/list").then((r) => r.json()),
        fetch("/api/workspace/browse").then((r) => r.json()),
      ]);
      setDiscovered(
        (listRes.workspaces ?? []).map((w: { file: string; name: string }) => ({
          name: w.name,
          path: w.file,
        }))
      );
      setBrowse(browseRes);
    } catch {
      setError("Could not scan folders");
    } finally {
      setLoading(false);
    }
  }

  async function navigate(path: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/workspace/browse?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBrowse(d);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openWorkspaceFile(file: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/workspace/parse?file=${encodeURIComponent(file)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setWorkspace(d.source, d.roots);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openFolder(path: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/workspace/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setWorkspace(d.source, d.roots);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const label = workspaceFile
    ? workspaceFile.split("/").pop()!.replace(".code-workspace", "")
    : "Open folder";

  return (
    <>
      <button
        onClick={openPicker}
        className="flex max-w-44 items-center gap-1.5 rounded-pill border border-hairline bg-canvas px-3.5 py-2 text-[13px] font-medium"
      >
        <FolderOpen size={15} className="shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <Sheet
          title="Open folder or workspace"
          variant="cream"
          onClose={() => setOpen(false)}
          bodyClassName="space-y-4"
        >
          <>
            {error && <p className="text-[13px] text-danger">{error}</p>}
              {/* Discovered .code-workspace files (multi-root) */}
              {discovered.length > 0 && (
                <section>
                  <p className="eyebrow mb-2 opacity-60">Workspaces</p>
                  <ul className="space-y-1.5">
                    {discovered.map((w) => (
                      <li key={w.path}>
                        <button
                          onClick={() => openWorkspaceFile(w.path)}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-left"
                        >
                          <Layers size={16} className="shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium">
                              {w.name}
                            </span>
                            <span className="block truncate font-mono text-[10px] opacity-60">
                              {w.path}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Folder browser — open ANY folder as a single-root workspace */}
              {browse && (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="eyebrow opacity-60">Browse</p>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] opacity-60">
                      {browse.path.replace(/^\/Users\/[^/]+/, "~")}
                    </span>
                  </div>

                  {/* Current folder actions */}
                  <div className="mb-2 flex gap-1.5">
                    {browse.parent && (
                      <button
                        onClick={() => navigate(browse.parent!)}
                        disabled={loading}
                        className="flex items-center gap-1 rounded-pill border border-hairline bg-canvas px-3.5 py-2 text-[13px] font-medium disabled:opacity-40"
                      >
                        <ChevronLeft size={15} /> Up
                      </button>
                    )}
                    <button
                      onClick={() => openFolder(browse.path)}
                      disabled={loading}
                      className="flex-1 rounded-pill bg-primary px-3.5 py-2 text-[13px] font-medium text-on-primary disabled:opacity-40"
                    >
                      Open this folder
                    </button>
                  </div>

                  <ul className="space-y-1.5">
                    {browse.workspaceFiles.map((w) => (
                      <li key={w.path}>
                        <button
                          onClick={() => openWorkspaceFile(w.path)}
                          className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-block-lilac px-3.5 py-2.5 text-left text-[14px] font-medium"
                        >
                          <Layers size={16} className="shrink-0" /> {w.name}
                        </button>
                      </li>
                    ))}
                    {browse.dirs.map((d) => (
                      <li key={d.path}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(d.path)}
                            disabled={loading}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline bg-canvas px-3.5 text-left text-[14px] disabled:opacity-40"
                          >
                            <Folder size={16} className="shrink-0" />
                            <span className="truncate">{d.name}</span>
                            <ChevronRight size={15} className="ml-auto shrink-0 opacity-40" />
                          </button>
                          <button
                            onClick={() => openFolder(d.path)}
                            disabled={loading}
                            className="min-h-11 shrink-0 rounded-pill border border-hairline bg-canvas px-3.5 text-[12px] font-medium disabled:opacity-40"
                          >
                            Open
                          </button>
                        </div>
                      </li>
                    ))}
                    {browse.dirs.length === 0 && browse.workspaceFiles.length === 0 && (
                      <p className="py-3 text-center text-[13px] opacity-60">
                        No subfolders here.
                      </p>
                    )}
                  </ul>
                </section>
              )}

            {loading && !browse && <p className="py-4 text-[14px]">Scanning…</p>}
          </>
        </Sheet>
      )}
    </>
  );
}
