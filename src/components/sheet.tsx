"use client";

// Shared bottom sheet (DESIGN.md "Sheets"): one frame for every sheet in
// the app — same 80dvh max height, scrim, eyebrow title, and a scrollable
// body with an optional pinned footer. No close button by design: tapping
// the scrim dismisses, matching every other sheet.

import type { ReactNode } from "react";

const VARIANT_BG = {
  /** Default: neutral sheets (commit, stash, connection, pickers). */
  canvas: "bg-canvas",
  /** Workspace picker / calm empty states. */
  cream: "bg-block-cream",
  /** Destructive context (panic rollback). */
  coral: "bg-block-coral",
} as const;

export type SheetVariant = keyof typeof VARIANT_BG;

export default function Sheet({
  title,
  variant = "canvas",
  onClose,
  bodyClassName = "",
  children,
  footer,
}: {
  /** Eyebrow label at the top of the sheet. */
  title: string;
  variant?: SheetVariant;
  /** Called on scrim tap. */
  onClose: () => void;
  /** Extra classes for the scrollable body (e.g. "space-y-3"). */
  bodyClassName?: string;
  /** Scrollable content. */
  children: ReactNode;
  /** Pinned action area below the scroll region (buttons). */
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className={`sheet ${VARIANT_BG[variant]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow mb-4">{title}</p>
        <div className={`sheet-scroll ${bodyClassName}`}>{children}</div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  );
}
