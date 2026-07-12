"use client";

// FR-3.3.4 — Floating Assistant Toolbar.
// A row of symbol/modifier keys the mobile virtual keyboard doesn't have,
// pinned directly ABOVE the keyboard. Position is computed from the
// VirtualKeyboard API when available, with a visualViewport.resize fallback.

import { useEffect, useState } from "react";

export interface ToolbarKey {
  label: string;
  /** Value handed to onKey (raw bytes for PTY, or text to insert in editor). */
  value: string;
}

export const PTY_KEYS: ToolbarKey[] = [
  { label: "Esc", value: "\x1b" },
  { label: "Tab", value: "\t" },
  { label: "^C", value: "\x03" },
  { label: "↑", value: "\x1b[A" },
  { label: "↓", value: "\x1b[B" },
  { label: "←", value: "\x1b[D" },
  { label: "→", value: "\x1b[C" },
  { label: "|", value: "|" },
  { label: "~", value: "~" },
  { label: "/", value: "/" },
];

export const EDITOR_KEYS: ToolbarKey[] = [
  { label: "Tab", value: "\t" },
  { label: "{", value: "{" },
  { label: "}", value: "}" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
  { label: "[", value: "[" },
  { label: "]", value: "]" },
  { label: "|", value: "|" },
  { label: "<", value: "<" },
  { label: ">", value: ">" },
  { label: "=", value: "=" },
  { label: ";", value: ";" },
];

interface VirtualKeyboardLike {
  overlaysContent: boolean;
  boundingRect: DOMRect;
  addEventListener(type: "geometrychange", cb: () => void): void;
  removeEventListener(type: "geometrychange", cb: () => void): void;
}

/**
 * Tracks how far the virtual keyboard intrudes into the layout viewport.
 * Returns the offset (px from the bottom of the layout viewport) at which
 * the toolbar should sit.
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike };
    const vk = nav.virtualKeyboard;

    if (vk) {
      // VirtualKeyboard API path (Chromium)
      vk.overlaysContent = true;
      const update = () => setOffset(vk.boundingRect.height);
      vk.addEventListener("geometrychange", update);
      update();
      return () => vk.removeEventListener("geometrychange", update);
    }

    // Fallback: visualViewport resize (iOS Safari & others)
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(Math.max(0, keyboardHeight));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}

export default function FloatingToolbar({
  keys,
  onKey,
  alwaysVisible = false,
}: {
  keys: ToolbarKey[];
  onKey: (value: string) => void;
  /** Show even when the keyboard is closed (e.g. chat quick keys). */
  alwaysVisible?: boolean;
}) {
  const offset = useKeyboardOffset();
  if (!alwaysVisible && offset === 0) return null;

  return (
    <div
      className="no-scrollbar fixed inset-x-0 z-40 flex gap-1.5 overflow-x-auto border-t border-hairline bg-surface-soft px-2 py-1.5"
      style={{ bottom: offset }}
    >
      {keys.map((k) => (
        <button
          key={k.label}
          // preventDefault on pointerdown keeps focus (and the keyboard) on
          // the input/editor — critical for a toolbar above the keyboard.
          onPointerDown={(e) => {
            e.preventDefault();
            onKey(k.value);
          }}
          className="min-h-9 shrink-0 rounded-sm border border-hairline bg-canvas px-3 font-mono text-[13px]"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
