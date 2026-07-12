// Shared client-side types (server counterparts live in src/lib/server/*).

export interface WorkspaceRoot {
  /** Absolute path of the folder. */
  path: string;
  /** Display name (folder name or workspace `name` entry). */
  name: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: "dir" | "file";
}

export interface GitFileStatus {
  path: string;
  /** M (modified) / A (added) / D (deleted) / R (renamed) / U (untracked) / C (conflict) */
  status: "M" | "A" | "D" | "R" | "U" | "C";
  staged: boolean;
}
