// Agent & skill management layer.
//
// Detects which AI coding agents are installed on the laptop and adapts
// each agent's "skill" concept (Claude Code skills/subagents, Codex custom
// prompts, Gemini CLI custom commands) into one common shape. All file
// operations are confined to the known per-agent config directories.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getActiveWorkspace } from "./workspace";

const execFileP = promisify(execFile);
const HOME = os.homedir();

export interface AgentDef {
  id: string;
  name: string;
  bin: string;
  /** Where this agent keeps its extensibility files. */
  skillSources: SkillSource[];
}

interface SkillSource {
  label: string;
  /** Base dir (absolute, or relative to a workspace root when projectLevel). */
  dir: string;
  kind: "skill-dir" | "md-files" | "toml-files";
  type: "skill" | "subagent" | "prompt" | "command";
  projectLevel?: boolean;
}

export const AGENTS: AgentDef[] = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    skillSources: [
      { label: "Global skills", dir: `${HOME}/.claude/skills`, kind: "skill-dir", type: "skill" },
      { label: "Global subagents", dir: `${HOME}/.claude/agents`, kind: "md-files", type: "subagent" },
      { label: "Slash commands", dir: `${HOME}/.claude/commands`, kind: "md-files", type: "command" },
      { label: "Project skills", dir: ".claude/skills", kind: "skill-dir", type: "skill", projectLevel: true },
      { label: "Project subagents", dir: ".claude/agents", kind: "md-files", type: "subagent", projectLevel: true },
      { label: "Project commands", dir: ".claude/commands", kind: "md-files", type: "command", projectLevel: true },
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    bin: "codex",
    skillSources: [
      { label: "Custom prompts", dir: `${HOME}/.codex/prompts`, kind: "md-files", type: "prompt" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    skillSources: [
      { label: "Custom commands", dir: `${HOME}/.gemini/commands`, kind: "toml-files", type: "command" },
      { label: "Project commands", dir: ".gemini/commands", kind: "toml-files", type: "command", projectLevel: true },
    ],
  },
  { id: "aider", name: "Aider", bin: "aider", skillSources: [] },
  { id: "opencode", name: "OpenCode", bin: "opencode", skillSources: [] },
];

// ---- Detection ----

export interface AgentStatus {
  id: string;
  name: string;
  bin: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  skillsSupported: boolean;
}

export async function detectAgents(): Promise<AgentStatus[]> {
  return Promise.all(
    AGENTS.map(async (agent) => {
      let binPath: string | null = null;
      let version: string | null = null;
      try {
        const { stdout } = await execFileP("which", [agent.bin]);
        binPath = stdout.trim() || null;
      } catch {
        /* not installed */
      }
      if (binPath) {
        try {
          const { stdout } = await execFileP(agent.bin, ["--version"], {
            timeout: 5000,
          });
          version = stdout.trim().split("\n")[0].slice(0, 80) || null;
        } catch {
          version = null; // installed but --version failed; still usable
        }
      }
      return {
        id: agent.id,
        name: agent.name,
        bin: agent.bin,
        installed: binPath !== null,
        path: binPath,
        version,
        skillsSupported: agent.skillSources.length > 0,
      };
    })
  );
}

// ---- Skill listing ----

export interface SkillItem {
  agentId: string;
  source: string;
  type: SkillSource["type"];
  scope: "global" | "project";
  name: string;
  path: string;
  description: string | null;
  /** Plugin-shipped files are managed by the marketplace: viewable, not editable. */
  readonly?: boolean;
}

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

async function listSource(
  agentId: string,
  source: SkillSource,
  baseDir: string,
  scope: "global" | "project"
): Promise<SkillItem[]> {
  const items: SkillItem[] = [];
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(baseDir, e.name);
    if (source.kind === "skill-dir" && e.isDirectory()) {
      const skillFile = path.join(full, "SKILL.md");
      const content = await fs.readFile(skillFile, "utf8").catch(() => null);
      if (content === null) continue;
      const fm = parseFrontmatter(content);
      items.push({
        agentId,
        source: source.label,
        type: source.type,
        scope,
        name: fm.name ?? e.name,
        path: skillFile,
        description: fm.description ?? null,
      });
    } else if (source.kind === "md-files" && e.isFile() && e.name.endsWith(".md")) {
      const content = await fs.readFile(full, "utf8").catch(() => "");
      const fm = parseFrontmatter(content);
      items.push({
        agentId,
        source: source.label,
        type: source.type,
        scope,
        name: fm.name ?? e.name.replace(/\.md$/, ""),
        path: full,
        description: fm.description ?? null,
      });
    } else if (source.kind === "toml-files" && e.isFile() && e.name.endsWith(".toml")) {
      const content = await fs.readFile(full, "utf8").catch(() => "");
      const desc = content.match(/^description\s*=\s*"(.*?)"/m)?.[1] ?? null;
      items.push({
        agentId,
        source: source.label,
        type: source.type,
        scope,
        name: e.name.replace(/\.toml$/, ""),
        path: full,
        description: desc,
      });
    }
  }
  return items;
}

export async function listSkills(agentId: string): Promise<SkillItem[]> {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return [];
  const roots = getActiveWorkspace().roots;
  const items: SkillItem[] = [];
  for (const source of agent.skillSources) {
    if (source.projectLevel) {
      for (const root of roots) {
        items.push(
          ...(await listSource(agent.id, source, path.join(root.path, source.dir), "project"))
        );
      }
    } else {
      items.push(...(await listSource(agent.id, source, source.dir, "global")));
    }
  }
  if (agentId === "claude") items.push(...(await listClaudePluginSkills()));
  return items;
}

/**
 * Skill dirs of ENABLED Claude Code plugins. The marketplaces dir is a
 * catalog cache of every available plugin, so we only surface plugins the
 * user actually enabled in settings.json (`enabledPlugins`).
 */
async function enabledPluginSkillDirs(): Promise<Array<{ plugin: string; dir: string }>> {
  const dirs: Array<{ plugin: string; dir: string }> = [];
  let enabled: Record<string, boolean> = {};
  try {
    const settings = JSON.parse(
      await fs.readFile(path.join(HOME, ".claude", "settings.json"), "utf8")
    );
    enabled = settings.enabledPlugins ?? {};
  } catch {
    return dirs;
  }
  for (const [key, on] of Object.entries(enabled)) {
    if (!on) continue;
    const [plugin, marketplace] = key.split("@");
    if (!plugin || !marketplace) continue;
    for (const sub of ["plugins", "external_plugins"]) {
      dirs.push({
        plugin,
        dir: path.join(
          HOME, ".claude", "plugins", "marketplaces", marketplace, sub, plugin, "skills"
        ),
      });
    }
  }
  return dirs;
}

/** Skills shipped by enabled Claude Code plugins — listed read-only. */
async function listClaudePluginSkills(): Promise<SkillItem[]> {
  const items: SkillItem[] = [];
  for (const { plugin, dir } of await enabledPluginSkillDirs()) {
    const source: SkillSource = {
      label: `Plugin: ${plugin}`,
      dir,
      kind: "skill-dir",
      type: "skill",
    };
    items.push(
      ...(await listSource("claude", source, dir, "global")).map((i) => ({
        ...i,
        readonly: true as const,
      }))
    );
  }
  return items;
}

// ---- Path guard for skill file operations ----

export class SkillAccessError extends Error {}

/**
 * Every dir a skill file may legally live under, given the active roots.
 * Plugin skill dirs are read-only (marketplace-managed), so they only count
 * for mode "read" — write/delete stays confined to user-owned dirs.
 */
async function allowedSkillDirs(mode: "read" | "write"): Promise<string[]> {
  const dirs: string[] = [];
  const roots = getActiveWorkspace().roots;
  for (const agent of AGENTS) {
    for (const source of agent.skillSources) {
      if (source.projectLevel) {
        for (const root of roots) dirs.push(path.join(root.path, source.dir));
      } else {
        dirs.push(source.dir);
      }
    }
  }
  if (mode === "read") {
    dirs.push(...(await enabledPluginSkillDirs()).map((p) => p.dir));
  }
  return dirs;
}

export async function assertSkillPath(
  requested: string,
  mode: "read" | "write" = "write"
): Promise<string> {
  // Clients don't know the server's home dir — accept "~/" paths.
  const expanded = requested.startsWith("~/")
    ? path.join(HOME, requested.slice(2))
    : requested;
  const resolved = path.resolve(expanded);
  const ok = (await allowedSkillDirs(mode)).some(
    (d) => resolved === d || resolved.startsWith(d + path.sep)
  );
  if (!ok) {
    throw new SkillAccessError(`Path is outside agent skill directories: ${resolved}`);
  }
  return resolved;
}

/**
 * Delete a skill file. For Claude-style skills (skills/<name>/SKILL.md) the
 * whole skill directory is removed; otherwise just the file.
 */
export async function deleteSkill(requested: string): Promise<string> {
  const file = await assertSkillPath(requested, "write");
  const dir = path.dirname(file);
  const parentName = path.basename(path.dirname(dir));
  if (path.basename(file) === "SKILL.md" && parentName === "skills") {
    await fs.rm(dir, { recursive: true, force: true });
    return `Removed skill ${path.basename(dir)}`;
  }
  await fs.rm(file, { force: true });
  return `Removed ${path.basename(file)}`;
}
