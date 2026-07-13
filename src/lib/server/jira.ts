// Jira Cloud integration (Tasks tab).
//
// Credentials live ONLY in the server's .env — the browser never sees the
// token; every request is proxied through these helpers. The whole feature
// is off (tab hidden) unless all three env vars are present:
//   JIRA_BASE_URL   e.g. https://yourcompany.atlassian.net
//   JIRA_EMAIL      Atlassian account email
//   JIRA_API_TOKEN  from id.atlassian.com → Security → API tokens

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
}

export function jiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, email, token };
}

async function jiraFetch(cfg: JiraConfig, path: string): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

async function jiraJson<T>(cfg: JiraConfig, path: string): Promise<T> {
  const r = await jiraFetch(cfg, path);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Jira ${r.status}: ${body.slice(0, 300) || r.statusText}`);
  }
  return (await r.json()) as T;
}

// ---- Issue list & detail ----

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  statusCategory: "new" | "indeterminate" | "done";
  type: string;
  priority: string | null;
  epic: string | null;
  updated: string;
  url: string;
}

export interface JiraIssueDetail extends JiraIssueSummary {
  labels: string[];
  reporter: string | null;
  /** Description converted from ADF to markdown (links & code preserved). */
  descriptionMd: string;
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

interface RawIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    issuetype?: { name?: string };
    priority?: { name?: string };
    parent?: { key?: string; fields?: { summary?: string } };
    labels?: string[];
    reporter?: { displayName?: string };
    updated?: string;
    description?: AdfNode | null;
  };
}

const LIST_FIELDS = "summary,status,issuetype,priority,parent,updated";
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

function toSummary(cfg: JiraConfig, issue: RawIssue): JiraIssueSummary {
  const f = issue.fields;
  const parent = f.parent;
  return {
    key: issue.key,
    summary: f.summary ?? "",
    status: f.status?.name ?? "Unknown",
    statusCategory:
      (f.status?.statusCategory?.key as JiraIssueSummary["statusCategory"]) ??
      "new",
    type: f.issuetype?.name ?? "Task",
    priority: f.priority?.name ?? null,
    epic: parent ? `${parent.key} ${parent.fields?.summary ?? ""}`.trim() : null,
    updated: f.updated ?? "",
    url: `${cfg.baseUrl}/browse/${issue.key}`,
  };
}

/** Open issues assigned to the token's user, most recently updated first. */
export async function listMyIssues(cfg: JiraConfig): Promise<JiraIssueSummary[]> {
  const jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
  const qs = `jql=${encodeURIComponent(jql)}&maxResults=50&fields=${LIST_FIELDS}`;
  // /search/jql is the current endpoint; fall back to legacy /search for
  // instances that don't have it yet.
  let r = await jiraFetch(cfg, `/rest/api/3/search/jql?${qs}`);
  if (r.status === 404) r = await jiraFetch(cfg, `/rest/api/3/search?${qs}`);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Jira ${r.status}: ${body.slice(0, 300) || r.statusText}`);
  }
  const d = (await r.json()) as { issues?: RawIssue[] };
  return (d.issues ?? []).map((i) => toSummary(cfg, i));
}

export async function getIssue(cfg: JiraConfig, key: string): Promise<JiraIssueDetail> {
  if (!ISSUE_KEY_RE.test(key)) throw new Error(`Invalid issue key: ${key}`);
  const issue = await jiraJson<RawIssue>(
    cfg,
    `/rest/api/3/issue/${key}?fields=${LIST_FIELDS},labels,reporter,description`
  );
  return {
    ...toSummary(cfg, issue),
    labels: issue.fields.labels ?? [],
    reporter: issue.fields.reporter?.displayName ?? null,
    descriptionMd: adfToMarkdown(issue.fields.description),
  };
}

// ---- ADF (Atlassian Document Format) → markdown ----
// Tolerant by design: unknown node types fall through to their children so
// new Jira features degrade to plain text instead of disappearing.

export function adfToMarkdown(doc: AdfNode | null | undefined): string {
  if (!doc?.content) return "";
  return blocks(doc.content).trim();
}

function blocks(nodes: AdfNode[]): string {
  return nodes.map((n) => block(n)).filter(Boolean).join("\n\n");
}

function block(n: AdfNode): string {
  switch (n.type) {
    case "paragraph":
      return inline(n.content ?? []);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return `${"#".repeat(level)} ${inline(n.content ?? [])}`;
    }
    case "codeBlock": {
      const lang = typeof n.attrs?.language === "string" ? n.attrs.language : "";
      const code = (n.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "blockquote":
    case "panel":
      return blocks(n.content ?? [])
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "bulletList":
      return (n.content ?? []).map((li) => `- ${listItem(li)}`).join("\n");
    case "orderedList":
      return (n.content ?? [])
        .map((li, i) => `${i + 1}. ${listItem(li)}`)
        .join("\n");
    case "taskList":
      return (n.content ?? [])
        .map((li) => `- [${li.attrs?.state === "DONE" ? "x" : " "}] ${listItem(li)}`)
        .join("\n");
    case "rule":
      return "---";
    case "table":
      return (n.content ?? [])
        .map(
          (row) =>
            `| ${(row.content ?? [])
              .map((cell) => blocks(cell.content ?? []).replace(/\n/g, " "))
              .join(" | ")} |`
        )
        .join("\n");
    case "mediaSingle":
    case "mediaGroup":
      return "*[attachment]*";
    default:
      return n.content ? blocks(n.content) : inline([n]);
  }
}

function listItem(li: AdfNode): string {
  // First paragraph inline; nested blocks indented under the marker.
  const parts = (li.content ?? []).map((c) => block(c));
  return parts
    .join("\n")
    .split("\n")
    .map((l, i) => (i === 0 ? l : `  ${l}`))
    .join("\n");
}

function inline(nodes: AdfNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text": {
          let t = n.text ?? "";
          for (const mark of n.marks ?? []) {
            if (mark.type === "code") t = `\`${t}\``;
            else if (mark.type === "strong") t = `**${t}**`;
            else if (mark.type === "em") t = `*${t}*`;
            else if (mark.type === "strike") t = `~~${t}~~`;
            else if (mark.type === "link") {
              const href = String(mark.attrs?.href ?? "");
              if (href) t = `[${t}](${href})`;
            }
          }
          return t;
        }
        case "hardBreak":
          return "\n";
        case "mention":
          return String(n.attrs?.text ?? "@user");
        case "emoji":
          return String(n.attrs?.shortName ?? "");
        case "inlineCard": {
          const url = String(n.attrs?.url ?? "");
          return url ? `[${url}](${url})` : "";
        }
        case "status":
          return `[${String(n.attrs?.text ?? "")}]`;
        case "date":
          return new Date(Number(n.attrs?.timestamp ?? 0)).toISOString().slice(0, 10);
        default:
          return n.content ? inline(n.content) : "";
      }
    })
    .join("");
}
