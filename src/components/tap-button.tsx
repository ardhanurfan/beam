"use client";

// Button for keys inside a horizontally-scrollable strip. Firing on
// pointerdown makes every scroll gesture that starts on a key press it —
// so: preventDefault on pointerdown only keeps focus (and the virtual
// keyboard) where it is, and the action fires on pointerup, only if the
// pointer stayed within the tap slop. A drag (scroll) either exceeds the
// slop or ends in pointercancel once the browser takes over the pan.

import { useRef, type ReactNode } from "react";

const TAP_SLOP_PX = 10;

export default function TapButton({
  onTap,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  onTap: () => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <button
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP_PX) return;
        onTap();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      className={className}
    >
      {children}
    </button>
  );
}
