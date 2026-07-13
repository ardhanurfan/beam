// Git command layer. Every command runs via execFile with a fixed argv —
// no shell interpolation, so user-supplied strings (commit messages, paths)
// can never inject commands. This is the "command allowlist" for Quick
// Actions required by PRD 2.4.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertInsideWorkspace } from "./workspace";

const execFileP = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const cwd = assertInsideWorkspace(root);
  const { stdout } = await execFileP("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export interface GitFileStatus {
  path: string;
  /** M (modified) / A (added) / D (deleted) / R (renamed) / U (untracked) / C (conflict) */
  status: "M" | "A" | "D" | "R" | "U" | "C";
  staged: boolean;
}

/** FR-3.2.1 — `git status --porcelain=v2` parsed to {path, status}[]. */
export async function gitStatus(root: string): Promise<GitFileStatus[]> {
  // -uall expands untracked DIRECTORIES into their individual files —
  // without it a fully-untracked folder shows up as one "scripts/" row
  // that can't be diffed (and discarding it deletes the whole folder).
  const out = await git(root, ["status", "--porcelain=v2", "-uall"]);
  const files: GitFileStatus[] = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const kind = line[0];
    if (kind === "1" || kind === "2") {
      // "1 XY sub mH mI mW hH hI path" | "2 ... path\torigPath"
      const parts = line.split(" ");
      const xy = parts[1];
      const pathPart = parts.slice(8).join(" ");
      const filePath = kind === "2" ? pathPart.split("\t")[0] : pathPart;
      const index = xy[0] !== "." ? xy[0] : null;
      const worktree = xy[1] !== "." ? xy[1] : null;
      const code = (worktree ?? index ?? "M") as GitFileStatus["status"];
      files.push({
        path: filePath,
        status: code === "R" ? "R" : (["M", "A", "D"].includes(code) ? code : "M") as GitFileStatus["status"],
        staged: index !== null && worktree === null,
      });
    } else if (kind === "?") {
      files.push({ path: line.slice(2), status: "U", staged: false });
    } else if (kind === "u") {
      const parts = line.split(" ");
      files.push({ path: parts.slice(10).join(" "), status: "C", staged: false });
    }
  }
  return files;
}

/** FR-3.2.2 — unified diff for one file (untracked files diffed against /dev/null). */
export async function gitDiff(root: string, file: string): Promise<string> {
  const tracked = await git(root, ["ls-files", "--", file]);
  if (!tracked.trim()) {
    // Untracked: synthesize an all-added diff.
    try {
      return await git(root, ["diff", "--no-index", "--", "/dev/null", file]);
    } catch (err) {
      // git diff --no-index exits 1 when files differ — stdout still has the diff.
      const e = err as { stdout?: string };
      if (e.stdout) return e.stdout;
      throw err;
    }
  }
  const staged = await git(root, ["diff", "--cached", "--", file]);
  const unstaged = await git(root, ["diff", "--", file]);
  return unstaged || staged;
}

/** FR-3.2.3 — Commit (& optionally Push) macro. Returns combined log output. */
export async function gitCommitAndPush(
  root: string,
  message: string,
  push = true
): Promise<{ log: string; pushed: boolean }> {
  let log = "";
  log += await git(root, ["add", "-A"]);
  log += await git(root, ["commit", "-m", message]);
  if (!push) return { log, pushed: false };
  try {
    log += await git(root, ["push"]);
    return { log, pushed: true };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    log += `\n[push failed] ${e.stderr ?? e.message ?? ""}`;
    return { log, pushed: false };
  }
}

/** FR-3.2.4 — Quick Stash macro: non-destructive save of the working tree. */
export async function gitQuickStash(root: string): Promise<string> {
  const name = `quick-stash-${Date.now()}`;
  const out = await git(root, ["stash", "push", "-u", "-m", name]);
  return out || `Stashed as ${name}`;
}

/** Per-file discard (VSCode-style). Destructive for that single file. */
export async function gitDiscardFile(root: string, file: string): Promise<string> {
  const tracked = await git(root, ["ls-files", "--", file]);
  if (tracked.trim()) {
    // Unstage first so staged-only edits are discarded too, then restore.
    await git(root, ["reset", "-q", "HEAD", "--", file]).catch(() => "");
    await git(root, ["checkout", "--", file]);
    return `Discarded changes in ${file}`;
  }
  await git(root, ["clean", "-f", "--", file]);
  return `Removed untracked ${file}`;
}

/** FR-3.2.5 — Panic Rollback. Destructive: caller MUST have double-confirmed. */
export async function gitPanicRollback(root: string): Promise<string> {
  let log = "";
  log += await git(root, ["checkout", "--", "."]);
  log += await git(root, ["clean", "-fd"]);
  return log || "Working tree reset to HEAD. Untracked files removed.";
}
