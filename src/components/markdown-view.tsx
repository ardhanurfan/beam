"use client";

// Minimal markdown renderer for task/issue descriptions. Builds React
// nodes directly (never innerHTML), so remote Jira content can't inject
// markup. Covers what task descriptions actually use: headings, lists,
// code fences, blockquotes, tables (as mono blocks), links, inline code,
// bold/italic/strike, and bare URLs.

import { Fragment, type ReactNode } from "react";

// `code` | [text](url) | **bold** | ~~strike~~ | *em* | bare URL
const INLINE_RE =
  /(`[^`\n]+`)|(\[[^\]\n]+\]\((?:https?:|mailto:)[^)\s]+\))|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|((?:https?:)\/\/[^\s<>)]+)/g;

function inlineNodes(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    if (m[1]) {
      out.push(
        <code key={key++} className="rounded bg-surface-soft px-1 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      const inner = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      out.push(
        <a
          key={key++}
          href={inner?.[2] ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="wrap-anywhere text-accent-magenta underline underline-offset-2"
        >
          {inner?.[1] ?? tok}
        </a>
      );
    } else if (m[3]) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (m[4]) {
      out.push(<s key={key++}>{tok.slice(2, -2)}</s>);
    } else if (m[5]) {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else {
      out.push(
        <a
          key={key++}
          href={tok}
          target="_blank"
          rel="noopener noreferrer"
          className="wrap-anywhere text-accent-magenta underline underline-offset-2"
        >
          {tok}
        </a>
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Lines of one paragraph: single newlines become line breaks. */
function paragraph(lines: string[], key: number): ReactNode {
  return (
    <p key={key} className="text-[14px] leading-relaxed">
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {inlineNodes(l)}
        </Fragment>
      ))}
    </p>
  );
}

export default function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flush = () => {
    if (para.length) blocks.push(paragraph(para, key++));
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-xl bg-block-navy p-3 font-mono text-[12px] leading-relaxed text-inverse-ink"
        >
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    // Table / mono rows (from Jira table conversion)
    if (/^\|.*\|\s*$/.test(line)) {
      flush();
      const rows: string[] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      i--;
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-xl bg-surface-soft p-3 font-mono text-[12px] leading-relaxed"
        >
          {rows.join("\n")}
        </pre>
      );
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const cls =
        level === 1
          ? "text-[17px] font-bold"
          : level === 2
          ? "text-[15px] font-bold"
          : "text-[14px] font-semibold";
      blocks.push(
        <p key={key++} className={`${cls} mt-1`}>
          {inlineNodes(heading[2])}
        </p>
      );
      continue;
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(line)) {
      flush();
      blocks.push(<hr key={key++} className="border-hairline" />);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      i--;
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-hairline pl-3 text-[14px] leading-relaxed opacity-80"
        >
          {quote.map((q, qi) => (
            <Fragment key={qi}>
              {qi > 0 && <br />}
              {inlineNodes(q)}
            </Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    // List (bulleted, ordered, or task)
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^(\s*)([-*]|\d+\.|\s)\s*\S/.test(lines[i]) && lines[i].trim()) {
        items.push(lines[i]);
        i++;
      }
      i--;
      blocks.push(
        <ul key={key++} className="space-y-1 text-[14px] leading-relaxed">
          {items.map((item, ii) => {
            const m = item.match(/^(\s*)([-*]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/);
            if (!m) {
              return (
                <li key={ii} className="pl-8">
                  {inlineNodes(item.trim())}
                </li>
              );
            }
            const indent = Math.min(3, Math.floor(m[1].length / 2));
            const marker = m[2] === "-" || m[2] === "*" ? "•" : m[2];
            const check = m[3] !== undefined ? (m[3] === " " ? "☐ " : "☑ ") : "";
            return (
              <li key={ii} className="flex gap-2" style={{ paddingLeft: indent * 16 }}>
                <span className="shrink-0 opacity-50">{marker}</span>
                <span className="min-w-0">
                  {check}
                  {inlineNodes(m[4])}
                </span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    // Blank line ends the current paragraph
    if (!line.trim()) {
      flush();
      continue;
    }

    para.push(line);
  }
  flush();

  return <div className="wrap-anywhere space-y-3">{blocks}</div>;
}
