"use client";

// Mini-editor (FR-3.3.3): CodeMirror 6, mobile-tuned, dynamic syntax mode
// from the file extension. Saving is EXPLICIT (no autosave): Save button,
// undo/redo controls, and an unsaved-changes popup on close.
// FR-3.3.4 — floating symbol toolbar above the virtual keyboard.

import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { undo, redo } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import { Undo2, Redo2, Save, X } from "lucide-react";
import FloatingToolbar, { EDITOR_KEYS } from "@/components/floating-toolbar";

type SaveState = "clean" | "dirty" | "saving" | "error";

const mobileTheme = EditorView.theme({
  "&": { fontSize: "13px", height: "100%" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    paddingBottom: "40vh", // room to scroll the caret above the keyboard
  },
  ".cm-gutters": { fontSize: "11px" },
  "&.cm-focused": { outline: "none" },
});

export default function EditorSheet({
  path,
  initialContent,
  onClose,
  onSaved,
  writeApi = "/api/fs/write",
  readOnly = false,
}: {
  path: string;
  initialContent: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Save endpoint — skill files use /api/skills/write (different guard). */
  writeApi?: string;
  /** View-only mode (e.g. plugin-shipped skills): no editing, no save. */
  readOnly?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedContent = useRef(initialContent);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function init() {
      // Dynamic syntax mode from the file extension (lazy-loaded grammar).
      const name = path.split("/").pop() ?? "";
      const desc = languages.find((l) => l.extensions.some((e) => name.endsWith(`.${e}`)));
      let langExt: Extension = [];
      if (desc) {
        try {
          langExt = await desc.load();
        } catch {
          /* fall back to plain text */
        }
      }
      if (disposed || !hostRef.current) return;

      const view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: initialContent,
          extensions: [
            basicSetup,
            mobileTheme,
            EditorView.lineWrapping,
            langExt,
            ...(readOnly
              ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
              : []),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                setSaveState(
                  update.state.doc.toString() === savedContent.current
                    ? "clean"
                    : "dirty"
                );
              }
            }),
          ],
        }),
      });
      viewRef.current = view;
    }

    init();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function save() {
    const view = viewRef.current;
    if (!view) return;
    const content = view.state.doc.toString();
    setSaveState("saving");
    try {
      const r = await fetch(writeApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, previewed: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      savedContent.current = content;
      setSaveState("clean");
      setSaveError(null);
      onSaved?.();
    } catch (err) {
      setSaveState("error");
      setSaveError((err as Error).message);
    }
  }

  function requestClose() {
    const dirty =
      viewRef.current &&
      viewRef.current.state.doc.toString() !== savedContent.current;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function insertAtCursor(text: string) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  const dirty = saveState === "dirty" || saveState === "error";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-hairline px-3 py-2.5">
        <button
          onClick={requestClose}
          aria-label="Close editor"
          className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
        >
          <X size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {path.split("/").pop()}
            {dirty && <span className="ml-1 text-accent-magenta">•</span>}
          </p>
          <p className="truncate font-mono text-[10px] opacity-50">{path}</p>
        </div>
        {readOnly ? (
          <span className="eyebrow ml-1 shrink-0 rounded-sm bg-surface-soft px-2 py-1">
            read-only
          </span>
        ) : (
          <>
            <button
              onClick={() => viewRef.current && undo(viewRef.current)}
              aria-label="Undo"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
            >
              <Undo2 size={17} />
            </button>
            <button
              onClick={() => viewRef.current && redo(viewRef.current)}
              aria-label="Redo"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-surface-soft"
            >
              <Redo2 size={17} />
            </button>
            <button
              onClick={save}
              disabled={saveState !== "dirty" && saveState !== "error"}
              className="ml-1 flex h-9 items-center gap-1.5 rounded-pill bg-primary px-4 text-[13px] font-medium text-on-primary disabled:opacity-30"
            >
              <Save size={15} />
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
      {saveError && (
        <p className="bg-block-pink px-4 py-1.5 text-[12px]">{saveError}</p>
      )}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />

      {/* Symbol keys the mobile keyboard lacks, pinned above it (FR-3.3.4) */}
      {!readOnly && <FloatingToolbar keys={EDITOR_KEYS} onKey={insertAtCursor} />}

      {/* Unsaved-changes popup */}
      {confirmDiscard && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-[20px] bg-canvas p-5">
            <p className="text-[16px] font-semibold">Unsaved changes</p>
            <p className="mt-1 text-[14px] opacity-70">
              This file has changes that haven&apos;t been saved. Discard them?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={async () => {
                  await save();
                  setConfirmDiscard(false);
                  onClose();
                }}
                className="min-h-11 rounded-pill bg-primary text-[14px] font-medium text-on-primary"
              >
                Save &amp; close
              </button>
              <button
                onClick={onClose}
                className="min-h-11 rounded-pill bg-block-coral text-[14px] font-medium"
              >
                Discard changes
              </button>
              <button
                onClick={() => setConfirmDiscard(false)}
                className="min-h-11 rounded-pill text-[14px] font-medium"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
