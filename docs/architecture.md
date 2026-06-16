# Architecture & Decision Record

Status: **design complete, build-ready.** This document is the durable record of the design produced during the grilling session. `CLAUDE.md` is the working-instructions distillation; this is the full rationale.

---

## 1. Product in one paragraph

Developers run many Claude Code agents across many projects, scattered across terminals. This app is a single readable workspace — ChatGPT-style — to monitor every session at a glance, read conversations comfortably, answer the agent's questions, and approve/deny its actions. It optimizes for **calm and readability**, not terminal-like density.

## 2. The load-bearing constraint

You **cannot inject input into a Claude Code process you didn't spawn** (its stdin belongs to its terminal). Therefore:

| Session kind | Source | Can read? | Can reply / approve? |
|---|---|---|---|
| **Observed** | transcript JSONL on disk | ✅ | ❌ (physically impossible) |
| **Owned** | spawned by the app via Agent SDK | ✅ | ✅ (`canUseTool`, programmatic input) |

The product is therefore a **monitor for everything + a controller for sessions you start in the app.** This is not a limitation we chose; it is the shape of reality, and the UI is honest about it (capability-gated controls).

## 3. Ground truth: what a real transcript contains

Captured from `~/.claude/projects/**/<sessionId>.jsonl` (23 projects, files up to ~32MB). Per-line JSON entries, `uuid`/`parentUuid` forming a tree:

- `assistant` / `user` entries with content blocks: `text`, `thinking`, `tool_use`, `tool_result`. In one sampled span: **50 text vs 209 tool_use vs 174 thinking** — tool activity dominates ~4:1.
- **`ai-title`** entries → session titles are free (AI-generated).
- **`AskUserQuestion` is a `tool_use`** with structured `options` → this is exactly how "the agent asks a question" appears; render its options as buttons.
- `file-history-snapshot` entries + `Edit`/`Write` tool calls → file-change data.
- `Bash`/`PowerShell` tool_use → commands; `tool_result` (errors) → error/warning data.
- `isSidechain: true` + nested `subagents/agent-*.jsonl` → subagents are nested sessions.
- `mode` / `permission-mode` recorded inline; lots of `attachment` (hook output), `system` (hook summaries), meta, and `<command-name>` XML wrappers = **noise to filter**.

**Two things absent from the transcript** — and they shape the design:
1. **Status** (running/waiting/blocked/error/done) — must be *derived*.
2. **Permission requests** — interactive, never written to disk. Only a hook can observe them.

## 4. The eleven resolved decisions

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| 1 | Integration model | **Hybrid, observer-first** behind one `SessionAdapter`: mock → transcript (read-only) → owned (SDK) | Reconciles "manage my existing terminals" (observe) with "reply/approve" (own). One interface keeps them symmetric. |
| 2 | Runtime shell | **Electron** | Orchestration is fundamentally Node (Agent SDK, `fs.watch`, subprocess, node-pty). Cursor/VS Code prove the polish bar is reachable. |
| 3 | Frontend | **React + TS + electron-vite + Tailwind + shadcn/ui + Zustand** | shadcn over Relume UI (app-oriented, ownable). Zustand: push-based, many-entity, real-time → selectors prevent mass re-render. |
| 4 | Data model | **Event-sourced, normalized `SessionEvent` stream** | Source is append-only; one taxonomy for all adapters; matches immutability; filtering noise *is* the readability feature. |
| 5 | Status | **Layered**: fs-watch inference baseline + optional hook → `127.0.0.1` receiver | Status isn't in the data; `blocked` is invisible without a hook. Inference works with zero setup; hook upgrades accuracy + adds instant pings. Degrades gracefully. |
| 6 | Persistence | **SQLite + FTS5, read-through** | Transcripts are already the store — don't duplicate. SQLite owns flags/notes/registry/owned-events/search; observed content parsed on demand + cached. |
| 7 | Process/perf | Adapters in main; heavy parse in **utility process**; IPC event + summary streams; **tail-first** load; **virtualized** list | Hits "fast" with 32MB files and many agents. |
| 8 | Primary layout | **Monitor-sidebar (live tiles) + single calm thread**; global "Needs you" tray; optional dashboard | Resolves "feels like ChatGPT" (one thread) vs "monitor many at once" (dense sidebar). |
| 9 | Feed rendering | **Prose-first**: text = bubbles; tools = collapsible chips; thinking folded; questions/files = cards | Tools outnumber text 4:1 — must demote activity to stay calm. Right panel mirrors activity for scanning. |
| 10 | Human-in-loop | `AskUserQuestion` options → **buttons**; owned = interactive, observed = **disabled-with-reason**; global pending tray | Core deliverable, honest about the observer limit. v2 seam: hook-mediated `PreToolUse` approvals could make observed approve/deny real. |
| 11 | Build order | **Mock-first Phase 1**, transcript adapter immediately next | Polished deterministic shell first; real data before the model drifts. |

## 5. System architecture

```
┌───────────────────────── Electron MAIN (Node) ──────────────────────────┐
│ adapters/ (SessionAdapter)            persistence/        status/         │
│  ├ MockAdapter     ┐                  SQLite + FTS5        deriveStatus    │
│  ├ TranscriptAdapter├─ normalize ─►   (flags, notes,      (pure SM)       │
│  │  (fs.watch)      │  SessionEvent[]   registry, search)     ▲           │
│  └ OwnedAdapter(SDK)┘      │                 ▲    [utility process: parse] │
│        ▲ canUseTool        │                 │                ┘            │
│   hook-server (127.0.0.1, only if opted in) ─┘                            │
└──────────────────────────────│───────────────────────────────────────────┘
                     typed IPC  │ (per-session event stream + sidebar summary stream)
┌──────────────────────────────▼──── Electron RENDERER (React) ────────────┐
│ Zustand (sessions/messages/approvals/ui)                                 │
│ Sidebar live-tiles │ prose-first ChatFeed │ Detail tabs │ NeedsYou │ ⌘K  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 6. Core contracts

```ts
// src/shared/session.ts
type SessionStatus = 'working' | 'awaiting_input' | 'awaiting_approval'
                   | 'error' | 'idle' | 'done';

interface SessionSummary {
  id: string; projectId: string; title: string; cwd: string; gitBranch?: string;
  status: SessionStatus; lastActivityAt: number;
  unread: boolean; starred: boolean; source: 'mock' | 'transcript' | 'owned';
}

// src/shared/events.ts — adapters EMIT these, UI FOLDS them
type SessionEvent =
  | { kind:'message';      id:string; ts:number; role:'user'|'assistant'; text:string }
  | { kind:'thinking';     id:string; ts:number; durationMs?:number; text?:string }
  | { kind:'tool_call';    id:string; ts:number; name:string; input:unknown;
                           status:'pending'|'ok'|'error'; result?:string; durationMs?:number }
  | { kind:'command';      id:string; ts:number; cmd:string; cwd?:string;
                           exitCode?:number; stdout?:string; stderr?:string }
  | { kind:'file_change';  id:string; ts:number; path:string;
                           op:'create'|'edit'|'delete'; added?:number; removed?:number; diff?:string }
  | { kind:'question';     id:string; ts:number; prompt:string;
                           options?:{ label:string; description?:string }[]; answer?:string }
  | { kind:'permission_request'; id:string; ts:number; tool:string; input:unknown;
                           decision?:'approved'|'denied' }
  | { kind:'subagent';     id:string; ts:number; agentType?:string; task:string; sessionRef:string }
  | { kind:'state_transition'; id:string; ts:number; from:SessionStatus; to:SessionStatus; reason?:string }
  | { kind:'notice';       id:string; ts:number; level:'info'|'warn'|'error'; text:string };

// src/main/adapters/SessionAdapter.ts
interface SessionAdapter {
  readonly source: 'mock' | 'transcript' | 'owned';
  listSessions(): Promise<SessionSummary[]>;
  openSession(id: string, opts?: { fromSeq?: number }): AsyncIterable<SessionEvent>;
  subscribe(onChange: (s: SessionSummary) => void): () => void;
  capabilities(id: string): { canReply: boolean; canApprove: boolean; canLifecycle: boolean };
  reply?(id: string, text: string): Promise<void>;
  answerQuestion?(id: string, questionId: string, choice: string): Promise<void>;
  decide?(id: string, requestId: string, decision: 'approved' | 'denied'): Promise<void>;
  lifecycle?(id: string, action: 'create' | 'pause' | 'resume' | 'close'): Promise<void>;
}
```

## 7. Status state machine (`deriveStatus`, pure)

Input: the tail of the normalized event stream + transcript file mtime (+ hook signal if present).

| Resulting status | Badge | Condition |
|---|---|---|
| `working` | running | last event is `tool_call:pending`, or file appended within the activity window |
| `awaiting_input` | waiting | last event is `question` with no `answer` |
| `awaiting_approval` | blocked | hook reports a pending permission **(authoritative)**; else inferred when a tool stalls + mtime frozen |
| `error` | error | last `tool_call:error` / `command` non-zero exit / `notice:error` |
| `idle` | done | turn closed (stop summary) and mtime stale, session still open |
| `done` | done | session ended / closed (owned) |

`awaiting_approval` is the only status that *requires* the hook to be reliable. Document the inference fallback as best-effort.

## 8. Project & session identity

- **Project** = git repo root (fallback: `cwd`). Read `cwd`/`gitBranch` from transcript entries, not the encoded directory name.
- **Session** = one `<sessionId>.jsonl`. Resumed/forked sessions may create new files; the registry maps files ↔ logical sessions.
- **Subagents** = nested `subagents/agent-*.jsonl`; surfaced as `subagent` events that expand into their own mini event stream inside the parent feed (not top-level sessions).

## 9. Persistence schema (sketch)

```
sessions(id PK, project_id, title, cwd, git_branch, source,
         status_cache, last_activity_at, read_offset)
flags(session_id PK, unread, starred, pinned)
notes(session_id, ts, body)
owned_events(session_id, seq, json)         -- app is source of truth for owned sessions
settings(key PK, value)
search_fts5(session_id, ts, role, text)     -- cross-session full-text search
```
Observed conversation content is **not** stored here — parsed on demand, LRU-cached in memory.

## 10. Phase plan

- **Phase 1 (now):** electron-vite scaffold; `shared/` contracts; **MockAdapter** + rich seed; 3-pane AppShell; sidebar live-tiles; prose-first ChatFeed (bubbles, chips, ThinkingFold, QuestionCard with option buttons, FileChangeCard); reply/approve UI gated by capabilities; dark-first tokens; Zustand store + IPC. TDD `deriveStatus` + `normalize` skeleton.
- **Phase 2:** `TranscriptAdapter` (fs.watch + parse + normalize against real JSONL); status inference; SQLite + FTS5; unread/star/notes; cross-session search; filters.
- **Phase 3:** `OwnedAdapter` via Agent SDK — launch sessions from the app, real replies + Approve/Deny; session lifecycle (create/pause/resume/close).
- **Phase 4:** opt-in status hook + `127.0.0.1` receiver (authoritative `blocked` + instant pings); dashboard overview; command palette depth; animations, empty/error states, keyboard map, responsive polish.

## 11. Security & privacy posture

Local-first. No network egress. Optional hook receiver binds `127.0.0.1` only. No telemetry. Transcripts may contain secrets — they are read locally and never transmitted. No AI attribution in git history.
