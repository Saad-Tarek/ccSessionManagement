/**
 * Deterministic mock seed. Covers every status badge (running/waiting/blocked/
 * error/done) and both capability modes (owned = interactive, transcript = read-only)
 * so the whole Phase 1 UI can be exercised without any real Claude Code data.
 */

import type { SessionEvent } from '@shared/events'
import {
  type SessionSummary,
  type ProjectSummary,
  type Capabilities,
  READ_ONLY_CAPABILITIES
} from '@shared/session'

const OWNED: Capabilities = { canReply: true, canApprove: true, canLifecycle: true }

const NOW = Date.now()
const minsAgo = (m: number): number => NOW - m * 60_000

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<SessionEvent, 'id' | 'seq' | 'ts'>

/** Builds a session's event list with monotonic seq/ts. */
class Stream {
  private seq = 0
  private ts: number
  readonly events: SessionEvent[] = []

  constructor(startTs: number) {
    this.ts = startTs
  }

  add(input: EventInput, gapSec = 25): SessionEvent {
    this.ts += gapSec * 1000
    const event = { id: `ev${this.seq}`, seq: this.seq, ts: this.ts, ...input } as SessionEvent
    this.seq++
    this.events.push(event)
    return event
  }

  get lastTs(): number {
    return this.ts
  }
}

export interface Seeded {
  projects: ProjectSummary[]
  summaries: SessionSummary[]
  events: Map<string, SessionEvent[]>
  capabilities: Map<string, Capabilities>
}

export function buildSeed(): Seeded {
  const events = new Map<string, SessionEvent[]>()
  const capabilities = new Map<string, Capabilities>()
  const summaries: SessionSummary[] = []

  // ── Acty #1 — WAITING (agent asked a question) · owned/interactive ──────────
  {
    const s = new Stream(minsAgo(8))
    s.add({ kind: 'message', role: 'user', text: 'Add session-based auth to the API.' })
    s.add({ kind: 'thinking', durationMs: 4200 })
    s.add({ kind: 'tool_call', name: 'Read', input: { file: 'src/server.ts' }, status: 'ok', durationMs: 120 })
    s.add({ kind: 'file_change', path: 'src/auth/session.ts', op: 'create', added: 64 })
    s.add({ kind: 'file_change', path: 'src/server.ts', op: 'edit', added: 12, removed: 3 })
    s.add({
      kind: 'message',
      role: 'assistant',
      text: 'I scaffolded session auth and wired the middleware. One decision before I store sessions:'
    })
    s.add({
      kind: 'question',
      questionId: 'q-store',
      prompt: 'Where should sessions be stored?',
      options: [
        { label: 'Redis', description: 'Fast, scales horizontally, extra dependency' },
        { label: 'Postgres', description: 'No new infra, reuses the existing DB' },
        { label: 'In-memory', description: 'Simplest, lost on restart — dev only' }
      ]
    })
    events.set('acty-1', s.events)
    capabilities.set('acty-1', OWNED)
    summaries.push({
      id: 'acty-1',
      projectId: 'proj-acty',
      title: 'Add session-based authentication',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\Acty',
      gitBranch: 'feat/auth',
      status: 'awaiting_input',
      source: 'owned',
      lastActivityAt: s.lastTs,
      headline: 'asked: where should sessions be stored?',
      unread: true,
      starred: true,
      pendingCount: 1
    })
  }

  // ── Acty #2 — RUNNING · owned ───────────────────────────────────────────────
  {
    const s = new Stream(minsAgo(2))
    s.add({ kind: 'message', role: 'user', text: 'Find and fix the N+1 query on the dashboard.' })
    s.add({ kind: 'thinking', durationMs: 2600 })
    s.add({ kind: 'tool_call', name: 'Grep', input: { pattern: 'findMany' }, status: 'ok', durationMs: 90 })
    s.add({ kind: 'tool_call', name: 'Read', input: { file: 'src/dashboard/queries.ts' }, status: 'pending' }, 4)
    events.set('acty-2', s.events)
    capabilities.set('acty-2', OWNED)
    summaries.push({
      id: 'acty-2',
      projectId: 'proj-acty',
      title: 'Fix dashboard N+1 query',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\Acty',
      gitBranch: 'perf/dashboard',
      status: 'working',
      source: 'owned',
      lastActivityAt: s.lastTs,
      headline: 'reading src/dashboard/queries.ts',
      unread: false,
      starred: false,
      pendingCount: 0
    })
  }

  // ── MizukiYoga #1 — BLOCKED (pending approval) · owned ──────────────────────
  {
    const s = new Stream(minsAgo(5))
    s.add({ kind: 'message', role: 'user', text: 'Do a clean production build.' })
    s.add({
      kind: 'message',
      role: 'assistant',
      text: 'The dist folder is stale — I need to remove it before rebuilding.'
    })
    s.add({
      kind: 'permission_request',
      requestId: 'perm-rm',
      tool: 'Bash',
      input: { command: 'rm -rf dist' }
    })
    events.set('yoga-1', s.events)
    capabilities.set('yoga-1', OWNED)
    summaries.push({
      id: 'yoga-1',
      projectId: 'proj-yoga',
      title: 'Clean production build',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\MizukiYoga',
      gitBranch: 'main',
      status: 'awaiting_approval',
      source: 'owned',
      lastActivityAt: s.lastTs,
      headline: 'wants to run: rm -rf dist',
      unread: true,
      starred: false,
      pendingCount: 1
    })
  }

  // ── MizukiYoga #2 — DONE/idle · transcript (read-only) ──────────────────────
  {
    const s = new Stream(minsAgo(95))
    s.add({ kind: 'message', role: 'user', text: 'Refactor the booking flow into smaller components.' })
    s.add({ kind: 'file_change', path: 'src/booking/BookingForm.tsx', op: 'edit', added: 8, removed: 140 })
    s.add({ kind: 'file_change', path: 'src/booking/Steps.tsx', op: 'create', added: 96 })
    s.add({ kind: 'command', cmd: 'npm run test -- booking', exitCode: 0 })
    s.add({ kind: 'message', role: 'assistant', text: 'Done — split into 4 components, tests green.' })
    events.set('yoga-2', s.events)
    capabilities.set('yoga-2', READ_ONLY_CAPABILITIES)
    summaries.push({
      id: 'yoga-2',
      projectId: 'proj-yoga',
      title: 'Refactor booking flow',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\MizukiYoga',
      gitBranch: 'refactor/booking',
      status: 'idle',
      source: 'transcript',
      lastActivityAt: s.lastTs,
      headline: 'completed: split booking into 4 components',
      unread: false,
      starred: false,
      pendingCount: 0
    })
  }

  // ── BtechJapan #1 — ERROR · owned ───────────────────────────────────────────
  {
    const s = new Stream(minsAgo(12))
    s.add({ kind: 'message', role: 'user', text: 'Run the test suite.' })
    s.add({ kind: 'command', cmd: 'npm test', exitCode: 1, stderr: '2 failing — auth.spec.ts: expected 200, got 401' })
    s.add({ kind: 'notice', level: 'error', text: '2 tests failed in auth.spec.ts' })
    events.set('btech-1', s.events)
    capabilities.set('btech-1', OWNED)
    summaries.push({
      id: 'btech-1',
      projectId: 'proj-btech',
      title: 'Run test suite',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\NewBtechJapan\\BtechJapan',
      gitBranch: 'master',
      status: 'error',
      source: 'owned',
      lastActivityAt: s.lastTs,
      headline: 'npm test failed — 2 tests in auth.spec.ts',
      unread: true,
      starred: false,
      pendingCount: 0
    })
  }

  // ── BtechJapan #2 — RUNNING · transcript (read-only terminal session) ───────
  {
    const s = new Stream(minsAgo(1))
    s.add({ kind: 'message', role: 'user', text: 'Build the production bundle and report sizes.' })
    s.add({ kind: 'tool_call', name: 'PowerShell', input: { command: 'npm run build' }, status: 'pending' }, 3)
    events.set('btech-2', s.events)
    capabilities.set('btech-2', READ_ONLY_CAPABILITIES)
    summaries.push({
      id: 'btech-2',
      projectId: 'proj-btech',
      title: 'Production build + bundle report',
      cwd: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\NewBtechJapan\\BtechJapan',
      gitBranch: 'legacy-btechjapan',
      status: 'working',
      source: 'transcript',
      lastActivityAt: s.lastTs,
      headline: 'running: npm run build',
      unread: false,
      starred: false,
      pendingCount: 0
    })
  }

  const projects: ProjectSummary[] = [
    { id: 'proj-acty', name: 'Acty', path: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\Acty', sessionCount: 2 },
    { id: 'proj-yoga', name: 'MizukiYoga', path: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\MizukiYoga', sessionCount: 2 },
    { id: 'proj-btech', name: 'BtechJapan', path: 'C:\\Users\\saadt\\Downloads\\Coding\\ClaudeCode\\NewBtechJapan\\BtechJapan', sessionCount: 2 }
  ]

  return { projects, summaries, events, capabilities }
}
