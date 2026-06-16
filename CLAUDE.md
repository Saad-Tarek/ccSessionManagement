# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A cross-platform Electron desktop app that turns many concurrent Claude Code sessions into one calm, ChatGPT-style control center: read conversations, answer the agent's questions, approve/deny actions, and monitor status across projects. It is **not** a terminal replacement — it optimizes for readability over terminal density.

## Commands

> The project is scaffolded with **electron-vite** (Vite for the renderer, esbuild for main/preload). One language end to end (TypeScript).

```bash
npm install            # first run (no native modules — pure JS/TS)
npm run dev            # electron-vite dev with HMR (main + preload + renderer)
npm run build          # typecheck (node + web tsconfigs) then production build
npm run package        # electron-builder -> distributable for the current OS
npm run lint           # eslint
npm run typecheck      # tsc --noEmit across tsconfig.node.json + tsconfig.web.json
npm test               # vitest run (unit tests)
npm run test:watch     # vitest watch
npx vitest run src/main/status/deriveStatus.test.ts   # a single test file
npx vitest run -t "awaiting_input"                     # a single test by name
```

Phase 1–2 deliberately use **no native modules** (so no `electron-rebuild` step). Persistence is a small JSON flag file and search is an in-memory index — see the persistence note below.

## The one decision that explains everything

You **cannot inject input into a Claude Code process running in a terminal you didn't spawn** — stdin belongs to that terminal. This single constraint drives the whole architecture:

- **Observed sessions** (the user's existing terminals, read via transcript files) are **read-only**. You can show the conversation and infer status, but you cannot reply or approve.
- **Owned sessions** (launched *from this app* via the Claude Agent SDK) are **fully interactive** — real `canUseTool` approvals and programmatic replies.

Every interactive control in the UI is **gated on `adapter.capabilities(id)`**; observed sessions render reply/approve disabled-with-reason. Do not add a code path that tries to write into an observed session — it is physically impossible and will mislead users.

## Architecture (the big picture)

Three layers, separated on purpose (`main` = orchestration, `renderer` = UI, `shared` = the contract between them).

```
Electron MAIN (Node)                          Electron RENDERER (React)
  adapters/ ──normalize──► SessionEvent[]  ──IPC──►  Zustand store ──► UI
  status/deriveStatus (pure state machine)            (sessions/messages/
  persistence/ SQLite + FTS5 (read-through)            approvals/ui slices)
  workers/ (utility process: heavy JSONL parsing)
  hook-server/ (127.0.0.1, only if user opts in)
```

**1. Adapter layer (`src/main/adapters/`)** — the seam to every data source, all implementing one `SessionAdapter` interface:
- `mock/` — rich deterministic seed; the only adapter used in Phase 1.
- `transcript/` — read-only observer. `fs.watch('~/.claude/projects')`; each `<sessionId>.jsonl` is one session. `parse.ts` reads raw lines, `normalize.ts` converts them to `SessionEvent[]`. **(Phase 2)**
- `owned/` — **implemented (Phase 3).** Sessions spawned via `@anthropic-ai/claude-agent-sdk`; full interactivity (reply + Approve/Deny via `canUseTool`, multi-turn via streaming input). The SDK is **ESM-only** and the main process is **CJS**, so it MUST be loaded with a dynamic `import()` (see `OwnedAdapter.loadSdk`) — a static import compiles to `require()` and throws `ERR_REQUIRE_ESM` at runtime. `CompositeAdapter` routes observed + owned sessions by id prefix (`owned-`); electron-builder `asarUnpack`s the SDK so its binary is executable when packaged.

The renderer **never sees raw transcript JSONL**. Adapters emit a normalized, append-only `SessionEvent` stream; the UI only folds events.

**2. Normalization is the product.** A real transcript is ~4:1 tool-calls-to-text and interleaves `thinking`, hook attachments, `SessionStart` context dumps, file snapshots, `<command-name>` XML wrappers, and meta entries. `normalize.ts` is where the firehose becomes calm typed events; thinking/hook/meta noise is dropped by default (a verbose toggle reveals it). Treat `normalize.ts` as the highest-value, most-tested module in the codebase.

**3. Status is derived, never stored upstream.** The transcript contains no status field. `status/deriveStatus.ts` is a **pure** function of (last-entry shape + file mtime) → `SessionStatus`. Critically, `awaiting_approval` (a pending permission prompt) is **invisible in the transcript** — it can only be known authoritatively via the optional hook (`hook-server/`). Without the hook, `blocked` is a best-effort inference. Keep `deriveStatus` pure and exhaustively tested.

**4. Persistence is read-through, not a mirror.** Transcripts are already a large on-disk store; do **not** duplicate them. The app owns only what the transcript can't:
- **Flags** (`src/main/persistence/flagStore.ts`): unread/starred/pinned/notes in a single JSON file under the app's userData dir. The service applies them onto discovered summaries and persists on `setFlag`.
- **Search** (`src/main/search/SearchIndex.ts`): an **in-memory** cross-session index built lazily via `adapter.openSession` (source-agnostic), invalidated per-session by the watcher.

This pure-JS approach (no native deps) is sized for tens-to-hundreds of sessions. **SQLite + FTS5 (`better-sqlite3`) is the documented upgrade path** if a corpus ever reaches the thousands — swap `flagStore`/`SearchIndex` for it behind the same service methods; nothing else changes.

## Core contracts (`src/shared/`)

These are the spine. Change them deliberately — every adapter and most components depend on them.

```ts
type SessionStatus = 'working' | 'awaiting_input' | 'awaiting_approval'
                   | 'error' | 'idle' | 'done';   // badges: running/waiting/blocked/error/done

type SessionEvent =                                 // adapters EMIT, UI FOLDS
  | { kind:'message'; role:'user'|'assistant'; text } | { kind:'thinking'; … }
  | { kind:'tool_call'; name; input; status; result?; durationMs? }
  | { kind:'command'; cmd; exitCode?; stderr? }     | { kind:'file_change'; path; op; diff? }
  | { kind:'question'; prompt; options?; answer? }  | { kind:'permission_request'; tool; decision? }
  | { kind:'subagent'; task; sessionRef }           | { kind:'state_transition'; from; to }
  | { kind:'notice'; level; text };

interface SessionAdapter {
  source: 'mock'|'transcript'|'owned';
  listSessions(): Promise<SessionSummary[]>;
  openSession(id, opts?): AsyncIterable<SessionEvent>;     // tail-first; older via fromSeq
  subscribe(onChange): Dispose;                            // live sidebar/status updates
  capabilities(id): { canReply; canApprove; canLifecycle }; // UI gates on this
  reply?/answerQuestion?/decide?/lifecycle?(…);            // owned only — absent on observed
}
```

## Performance rules (non-negotiable for "fast")

- Heavy transcript parsing runs in a **utility process** (`src/main/workers/`), never on the main thread.
- Large transcripts (up to ~32MB) load **tail-first**: most-recent window first, older events lazy-loaded on scroll-up via `openSession({ fromSeq })`.
- The message feed is **virtualized**. The sidebar subscribes to a lightweight summary stream — a new message in session A must not re-render the other 49 tiles (use Zustand selectors).

## Conventions specific to this repo

- **Do not add `Claude Code` (or any AI) as a git author / co-author.** (Also disabled globally.)
- **Local-only and private:** the app reads local files and makes **no network egress**. The optional hook receiver binds to `127.0.0.1` only. No telemetry. Transcripts may contain secrets — never transmit them.
- **TDD targets:** `normalize.ts`, `deriveStatus.ts`, and the Zustand reducers are pure and carry the 80% coverage weight; use golden-file fixtures captured from real `~/.claude/projects/**/*.jsonl`. Component tests cover the feed rendering.
- **Build order:** Phase 1 is mock-adapter only (shell + sidebar tiles + prose-first feed + reply/approval UI). The `transcript` adapter lands immediately after in Phase 2 — design against the real JSONL shape now so the model doesn't drift. See `docs/architecture.md`.

## Reference material

- `docs/architecture.md` — full decision record (11 resolved decisions + rationale) and the Phase 1–4 plan.
- `layout_example*.html`, `summary.md` — original Relume/shadcn visual references and the product brief (placeholder scaffolds; not the implemented UI).
