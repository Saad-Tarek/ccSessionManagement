/**
 * In-memory adapter over the deterministic seed. Drives all of Phase 1 with no
 * real Claude Code data. Interactive methods mutate state immutably and notify
 * subscribers, so reply / answer / approve flows are exercisable end to end.
 *
 * A gentle interval bumps `working` sessions' activity to demonstrate live tiles.
 */

import type { SessionEvent, QuestionEvent, PermissionRequestEvent } from '@shared/events'
import type { SessionSummary, Capabilities } from '@shared/session'
import { READ_ONLY_CAPABILITIES } from '@shared/session'
import type { SessionAdapter, OpenOptions } from '../SessionAdapter'
import { buildSeed } from './seed'

export class MockAdapter implements SessionAdapter {
  readonly source = 'mock' as const

  private summaries = new Map<string, SessionSummary>()
  private events = new Map<string, SessionEvent[]>()
  private caps = new Map<string, Capabilities>()
  private listeners = new Set<(s: SessionSummary) => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor() {
    const seed = buildSeed()
    seed.summaries.forEach((s) => this.summaries.set(s.id, s))
    this.events = seed.events
    this.caps = seed.capabilities
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.summaries.values()]
  }

  async *openSession(id: string, opts?: OpenOptions): AsyncIterable<SessionEvent> {
    const all = this.events.get(id) ?? []
    for (const e of all) {
      if (opts?.fromSeq !== undefined && e.seq < opts.fromSeq) continue
      yield e
    }
  }

  capabilities(id: string): Capabilities {
    return this.caps.get(id) ?? READ_ONLY_CAPABILITIES
  }

  subscribe(onChange: (s: SessionSummary) => void): () => void {
    this.listeners.add(onChange)
    if (!this.timer) this.startHeartbeat()
    return () => {
      this.listeners.delete(onChange)
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  async reply(id: string, text: string): Promise<void> {
    this.append(id, { kind: 'message', role: 'user', text })
    this.patch(id, { status: 'working', headline: 'thinking…' })
  }

  async answerQuestion(id: string, questionId: string, choice: string): Promise<void> {
    const updated = this.mapEvents(id, (e) =>
      e.kind === 'question' && (e as QuestionEvent).questionId === questionId
        ? ({ ...e, answer: choice } as QuestionEvent)
        : e
    )
    if (updated) this.append(id, { kind: 'message', role: 'user', text: choice })
    this.patch(id, { status: 'working', headline: `chose: ${choice}`, pendingCount: 0 })
  }

  async decide(id: string, requestId: string, decision: 'approved' | 'denied'): Promise<void> {
    this.mapEvents(id, (e) =>
      e.kind === 'permission_request' && (e as PermissionRequestEvent).requestId === requestId
        ? ({ ...e, decision } as PermissionRequestEvent)
        : e
    )
    this.patch(id, {
      status: decision === 'approved' ? 'working' : 'idle',
      headline: decision === 'approved' ? 'permission approved — continuing' : 'permission denied',
      pendingCount: 0
    })
  }

  async lifecycle(id: string, action: 'create' | 'pause' | 'resume' | 'close'): Promise<void> {
    if (action === 'pause') this.patch(id, { status: 'idle', headline: 'paused' })
    if (action === 'resume') this.patch(id, { status: 'working', headline: 'resumed' })
    if (action === 'close') this.patch(id, { status: 'done', headline: 'closed' })
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.timer = setInterval(() => {
      for (const s of this.summaries.values()) {
        if (s.status === 'working') this.patch(s.id, { lastActivityAt: Date.now() })
      }
    }, 4000)
  }

  private notify(id: string): void {
    const s = this.summaries.get(id)
    if (s) this.listeners.forEach((fn) => fn(s))
  }

  private patch(id: string, fields: Partial<SessionSummary>): void {
    const prev = this.summaries.get(id)
    if (!prev) return
    this.summaries.set(id, { ...prev, lastActivityAt: Date.now(), ...fields })
    this.notify(id)
  }

  private append(id: string, input: Omit<Extract<SessionEvent, { kind: 'message' }>, 'id' | 'seq' | 'ts'>): void {
    const all = this.events.get(id) ?? []
    const seq = all.length
    const event = { id: `ev${seq}`, seq, ts: Date.now(), ...input } as SessionEvent
    this.events.set(id, [...all, event])
  }

  private mapEvents(id: string, fn: (e: SessionEvent) => SessionEvent): boolean {
    const all = this.events.get(id)
    if (!all) return false
    this.events.set(id, all.map(fn))
    return true
  }
}
