"use client";

// FR-3.2.2 — Stacked Diff Layout: per hunk, removed (red) lines stacked
// vertically ABOVE added (green) lines. Never side-by-side; never a
// horizontal scroll.

import parseDiff from "parse-diff";
import { useMemo } from "react";

interface StackedLine {
  kind: "context" | "removed" | "added" | "hunk-header";
  text: string;
}

function stackHunks(diffText: string): StackedLine[][] {
  const files = parseDiff(diffText);
  const hunks: StackedLine[][] = [];
  for (const file of files) {
    for (const chunk of file.chunks) {
      const lines: StackedLine[] = [
        { kind: "hunk-header", text: chunk.content },
      ];
      // Group contiguous +/- runs and emit removed-then-added.
      let run: StackedLine[] = [];
      const flush = () => {
        lines.push(...run.filter((l) => l.kind === "removed"));
        lines.push(...run.filter((l) => l.kind === "added"));
        run = [];
      };
      for (const change of chunk.changes) {
        if (change.type === "normal") {
          flush();
          lines.push({ kind: "context", text: change.content.slice(1) });
        } else if (change.type === "del") {
          run.push({ kind: "removed", text: change.content.slice(1) });
        } else {
          run.push({ kind: "added", text: change.content.slice(1) });
        }
      }
      flush();
      hunks.push(lines);
    }
  }
  return hunks;
}

export default function StackedDiff({ diff }: { diff: string }) {
  const hunks = useMemo(() => stackHunks(diff), [diff]);

  if (hunks.length === 0) {
    return <p className="px-4 py-6 text-center text-[14px]">No changes in this file.</p>;
  }

  return (
    <div className="space-y-3 font-mono text-[12px] leading-[1.6]">
      {hunks.map((lines, h) => (
        <div key={h} className="overflow-hidden rounded-md border border-hairline">
          {lines.map((l, i) =>
            l.kind === "hunk-header" ? (
              <div key={i} className="eyebrow bg-surface-soft px-3 py-1.5">
                {l.text}
              </div>
            ) : (
              <div
                key={i}
                className={`whitespace-pre-wrap break-words px-3 ${
                  l.kind === "removed"
                    ? "bg-block-pink"
                    : l.kind === "added"
                    ? "bg-block-mint"
                    : "bg-canvas"
                }`}
              >
                <span className="mr-2 select-none opacity-50">
                  {l.kind === "removed" ? "−" : l.kind === "added" ? "+" : " "}
                </span>
                {l.text || " "}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
