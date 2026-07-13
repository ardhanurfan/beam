// Custom task storage (Tasks tab): plain markdown files in ~/.beam/tasks.
// Same philosophy as skills — one file per task, editable in the app's
// editor, guarded so the API can never touch anything outside the dir.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const TASKS_DIR = path.join(os.homedir(), ".beam", "tasks");

export class TaskAccessError extends Error {}

export interface CustomTask {
  name: string;
  /** First `# ` heading in the file, or the file name. */
  title: string;
  path: string;
  updatedAt: number;
}

export function assertTaskPath(requested: string): string {
  const resolved = path.resolve(requested);
  if (
    !resolved.startsWith(TASKS_DIR + path.sep) ||
    !resolved.endsWith(".md") ||
    resolved.includes("\0")
  ) {
    throw new TaskAccessError(`Path is outside the tasks directory: ${resolved}`);
  }
  return resolved;
}

export async function listTasks(): Promise<CustomTask[]> {
  const entries = await fs.readdir(TASKS_DIR, { withFileTypes: true }).catch(() => []);
  const tasks: CustomTask[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const full = path.join(TASKS_DIR, e.name);
    const [content, stat] = await Promise.all([
      fs.readFile(full, "utf8").catch(() => ""),
      fs.stat(full).catch(() => null),
    ]);
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    tasks.push({
      name: e.name.replace(/\.md$/, ""),
      title: heading || e.name.replace(/\.md$/, ""),
      path: full,
      updatedAt: stat?.mtimeMs ?? 0,
    });
  }
  return tasks.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Create a new task file from a display name. Fails if it already exists. */
export async function createTask(name: string): Promise<CustomTask> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new TaskAccessError("Task name is empty");
  const file = path.join(TASKS_DIR, `${slug}.md`);
  await fs.mkdir(TASKS_DIR, { recursive: true });
  try {
    await fs.writeFile(file, `# ${name.trim()}\n\n`, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new TaskAccessError(`Task "${slug}" already exists`);
    }
    throw err;
  }
  return { name: slug, title: name.trim(), path: file, updatedAt: Date.now() };
}
