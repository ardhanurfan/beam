# Graph Report - .  (2026-07-14)

## Corpus Check
- Corpus is ~23,853 words - fits in a single context window. You may not need a graph.

## Summary
- 289 nodes · 552 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Filesystem API Routes
- App Views (Home, Agents, Skills UI)
- Sessions API & WS Protocol
- Agents & Skills API
- Jira Integration
- Markdown View & Task Sheet
- Tasks API
- Editor Sheet & Toolbar
- Connection Sheet & Push Client
- Root Layout & App Icon
- Voice Input Hook
- Stacked Diff View
- Workspace Browse API

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 23 edges
2. `SessionHub` - 17 edges
3. `SessionConnection` - 16 edges
4. `WorkspaceAccessError` - 12 edges
5. `git()` - 11 edges
6. `assertInsideWorkspace()` - 9 edges
7. `Sheet()` - 8 edges
8. `useActiveSession()` - 8 edges
9. `listSkills()` - 7 edges
10. `assertSkillPath()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Beam App Icon (SVG favicon)` --references--> `RootLayout()`  [AMBIGUOUS]
  src/app/icon.svg → src/app/layout.tsx
- `GET()` --calls--> `assertInsideWorkspace()`  [EXTRACTED]
  src/app/api/fs/read/route.ts → src/lib/server/workspace.ts
- `GET()` --calls--> `assertInsideWorkspace()`  [EXTRACTED]
  src/app/api/fs/tree/route.ts → src/lib/server/workspace.ts
- `POST()` --calls--> `assertInsideWorkspace()`  [EXTRACTED]
  src/app/api/fs/write/route.ts → src/lib/server/workspace.ts
- `GET()` --calls--> `assertSkillPath()`  [EXTRACTED]
  src/app/api/skills/read/route.ts → src/lib/server/agents.ts

## Import Cycles
- None detected.

## Communities (17 total, 1 thin omitted)

### Community 0 - "Filesystem API Routes"
Cohesion: 0.08
Nodes (35): GET(), GET(), HIDDEN, POST(), GET(), POST(), POST(), GET() (+27 more)

### Community 1 - "App Views (Home, Agents, Skills UI)"
Cohesion: 0.09
Nodes (28): AgentStatus, AgentsView(), SkillItem, TYPE_BADGE, AppShell(), BottomNav(), TABS, FilesView() (+20 more)

### Community 2 - "Sessions API & WS Protocol"
Cohesion: 0.09
Nodes (11): Envelope, FrameType, makeEnvelope(), ResyncRequestPayload, ResyncResponsePayload, SessionInfo, SessionStatePayload, SessionConnection (+3 more)

### Community 3 - "Agents & Skills API"
Cohesion: 0.12
Nodes (24): GET(), POST(), GET(), GET(), POST(), GET(), AgentDef, AGENTS (+16 more)

### Community 4 - "Jira Integration"
Cohesion: 0.19
Nodes (17): GET(), GET(), AdfNode, adfToMarkdown(), block(), blocks(), getIssue(), inline() (+9 more)

### Community 5 - "Markdown View & Task Sheet"
Cohesion: 0.15
Nodes (14): inlineNodes(), MarkdownView(), paragraph(), AgentStatus, dedupeByName(), RunTaskSheet(), SkillItem, toggle() (+6 more)

### Community 6 - "Tasks API"
Cohesion: 0.24
Nodes (11): POST(), GET(), GET(), POST(), POST(), assertTaskPath(), createTask(), CustomTask (+3 more)

### Community 7 - "Editor Sheet & Toolbar"
Cohesion: 0.19
Nodes (9): mobileTheme, SaveState, EDITOR_KEYS, FloatingToolbar(), PTY_KEYS, ToolbarKey, useKeyboardOffset(), VirtualKeyboardLike (+1 more)

### Community 8 - "Connection Sheet & Push Client"
Cohesion: 0.30
Nodes (10): ConnectionSheet(), formatUptime(), HostInfo, STATUS_LABEL, disablePush(), enablePush(), getPushState(), PushState (+2 more)

### Community 9 - "Root Layout & App Icon"
Cohesion: 0.22
Nodes (8): Beam App Icon (SVG favicon), Beam Brand Identity, inter, jetbrainsMono, metadata, RootLayout(), viewport, SwRegister()

### Community 10 - "Voice Input Hook"
Cohesion: 0.33
Nodes (6): getRecognitionCtor(), SpeechRecognitionCtor, SpeechRecognitionEventLike, SpeechRecognitionLike, subscribeNoop(), useVoiceInput()

### Community 12 - "Stacked Diff View"
Cohesion: 0.67
Nodes (3): StackedDiff(), StackedLine, stackHunks()

## Ambiguous Edges - Review These
- `RootLayout()` → `Beam App Icon (SVG favicon)`  [AMBIGUOUS]
  src/app/icon.svg · relation: references

## Knowledge Gaps
- **48 isolated node(s):** `HIDDEN`, `HIDDEN`, `inter`, `jetbrainsMono`, `metadata` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `RootLayout()` and `Beam App Icon (SVG favicon)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `useAppStore` connect `App Views (Home, Agents, Skills UI)` to `Connection Sheet & Push Client`, `Sessions API & WS Protocol`, `Markdown View & Task Sheet`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `SessionHub` connect `Sessions API & WS Protocol` to `App Views (Home, Agents, Skills UI)`, `Markdown View & Task Sheet`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **What connects `HIDDEN`, `HIDDEN`, `inter` to the rest of the system?**
  _48 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Filesystem API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.08446455505279035 - nodes in this community are weakly interconnected._
- **Should `App Views (Home, Agents, Skills UI)` be split into smaller, more focused modules?**
  _Cohesion score 0.0898989898989899 - nodes in this community are weakly interconnected._
- **Should `Sessions API & WS Protocol` be split into smaller, more focused modules?**
  _Cohesion score 0.08970099667774087 - nodes in this community are weakly interconnected._