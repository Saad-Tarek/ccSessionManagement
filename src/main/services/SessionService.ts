/**
 * Owns the active adapter and bridges it to the renderer over IPC:
 *  - request/response handlers (list, open, capabilities, interactive, search)
 *  - main->renderer push for live summaries
 *  - applies persisted user flags onto discovered summaries
 *  - keeps the cross-session search index warm and invalidated
 */

import { ipcMain } from 'electron'
import {
  IpcChannel,
  type SessionEventBatch,
  type OpenSessionRequest,
  type LoadOlderRequest,
  type ReplyRequest,
  type AnswerQuestionRequest,
  type DecideRequest,
  type LifecycleRequest,
  type SetFlagRequest
} from '@shared/ipc-contract'
import type { ProjectSummary, SessionSummary } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import type { SessionAdapter } from '../adapters/SessionAdapter'
import type { FlagStore } from '../persistence/flagStore'
import { SearchIndex } from '../search/SearchIndex'
import {
  computeStats,
  mergeStats,
  type SessionStats,
  type InsightsResult,
  type ProjectInsight
} from '@shared/stats'

type Send = (channel: string, payload: unknown) => void

/** Background-monitor hooks (notifications + tray) wired in by the main process. */
export interface SessionMonitor {
  notifications: { seed(summaries: SessionSummary[]): void; onSummary(summary: SessionSummary): void }
  tray: { updateBadge(needsYou: number): void }
}

export class SessionService {
  private unsubscribe: (() => void) | null = null
  private readonly search: SearchIndex
  private lastSummaries: SessionSummary[] = []
  private openSessionId: string | null = null

  constructor(
    private readonly adapter: SessionAdapter,
    private readonly send: Send,
    private readonly flags: FlagStore,
    private readonly monitor?: SessionMonitor
  ) {
    this.search = new SearchIndex(adapter)
  }

  register(): void {
    ipcMain.handle(IpcChannel.listSessions, () => this.listSessions())
    ipcMain.handle(IpcChannel.listProjects, () => this.listProjects())
    ipcMain.handle(IpcChannel.capabilities, (_e, id: string) => this.adapter.capabilities(id))
    ipcMain.handle(IpcChannel.openSession, (_e, req: OpenSessionRequest) => this.openSession(req))
    ipcMain.handle(IpcChannel.closeSession, () => undefined)
    ipcMain.handle(IpcChannel.loadOlder, (_e, req: LoadOlderRequest) => this.loadOlder(req))
    ipcMain.handle(IpcChannel.reply, (_e, r: ReplyRequest) => this.adapter.reply?.(r.sessionId, r.text))
    ipcMain.handle(IpcChannel.answerQuestion, (_e, r: AnswerQuestionRequest) =>
      this.adapter.answerQuestion?.(r.sessionId, r.questionId, r.choice)
    )
    ipcMain.handle(IpcChannel.decide, (_e, r: DecideRequest) =>
      this.adapter.decide?.(r.sessionId, r.requestId, r.decision)
    )
    ipcMain.handle(IpcChannel.lifecycle, (_e, r: LifecycleRequest) =>
      this.adapter.lifecycle?.(r.sessionId, r.action)
    )
    ipcMain.handle(IpcChannel.setFlag, (_e, r: SetFlagRequest) => {
      this.flags.set(r.sessionId, r.flag, r.value)
    })
    ipcMain.handle(IpcChannel.search, (_e, query: string) => this.search.query(query, this.lastSummaries))
    ipcMain.handle(IpcChannel.getInsights, () => this.getInsights())

    this.unsubscribe = this.adapter.subscribe((summary) => {
      this.search.invalidate(summary.id)
      const withFlags = this.applyFlags(summary)
      this.lastSummaries = upsert(this.lastSummaries, withFlags)
      this.send(IpcChannel.onSummary, withFlags)
      // Keep the currently-open conversation live as its transcript grows.
      if (summary.id === this.openSessionId) void this.openSession({ sessionId: summary.id })
      // Background monitor: notify on attention transitions, update the tray badge.
      this.monitor?.notifications.onSummary(withFlags)
      this.monitor?.tray.updateBadge(needsYouCount(this.lastSummaries))
    })
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Re-discover and re-push every summary. Used after the machine resumes from sleep. */
  async refreshAll(): Promise<void> {
    const list = await this.listSessions()
    for (const s of list) this.send(IpcChannel.onSummary, s)
  }

  /** Aggregate token/cost/activity stats across all sessions (reads each tail). */
  async getInsights(): Promise<InsightsResult> {
    const todayStart = startOfTodayMs()
    const allTotal: SessionStats[] = []
    const allToday: SessionStats[] = []
    const byProject = new Map<
      string,
      { name: string; total: SessionStats[]; today: SessionStats[]; sessions: number }
    >()

    let skipped = 0
    for (const summary of this.lastSummaries) {
      const events: SessionEvent[] = []
      try {
        for await (const e of this.adapter.openSession(summary.id)) events.push(e)
      } catch (err) {
        skipped++
        console.error('[insights] failed to read session', summary.id, err)
        continue
      }
      const total = computeStats(events)
      const today = computeStats(events.filter((e) => e.ts >= todayStart))
      allTotal.push(total)
      allToday.push(today)
      const g = byProject.get(summary.projectId) ?? {
        name: basename(summary.cwd),
        total: [],
        today: [],
        sessions: 0
      }
      g.total.push(total)
      g.today.push(today)
      g.sessions++
      byProject.set(summary.projectId, g)
    }

    const projects: ProjectInsight[] = [...byProject.entries()]
      .map(([projectId, g]) => ({
        projectId,
        name: g.name,
        sessions: g.sessions,
        total: mergeStats(g.total),
        today: mergeStats(g.today)
      }))
      .sort((a, b) => b.total.costUsd - a.total.costUsd)

    return { total: mergeStats(allTotal), today: mergeStats(allToday), projects, skipped }
  }

  private async listSessions(): Promise<SessionSummary[]> {
    const list = (await this.adapter.listSessions()).map((s) => this.applyFlags(s))
    this.lastSummaries = list
    this.monitor?.notifications.seed(list)
    this.monitor?.tray.updateBadge(needsYouCount(list))
    return list
  }

  private applyFlags(s: SessionSummary): SessionSummary {
    const f = this.flags.get(s.id)
    return { ...s, unread: f.unread ?? s.unread, starred: f.starred ?? s.starred }
  }

  private async openSession(req: OpenSessionRequest): Promise<void> {
    this.openSessionId = req.sessionId
    const events: SessionEvent[] = []
    for await (const e of this.adapter.openSession(req.sessionId)) events.push(e)
    const batch: SessionEventBatch = { sessionId: req.sessionId, events, initial: true }
    this.send(IpcChannel.onEvents, batch)
  }

  private async loadOlder(req: LoadOlderRequest): Promise<SessionEvent[]> {
    const out: SessionEvent[] = []
    for await (const e of this.adapter.openSession(req.sessionId, { fromSeq: 0 })) {
      if (e.seq < req.beforeSeq) out.push(e)
    }
    return out
  }

  private async listProjects(): Promise<ProjectSummary[]> {
    const sessions = await this.adapter.listSessions()
    const byProject = new Map<string, ProjectSummary>()
    for (const s of sessions) {
      const existing = byProject.get(s.projectId)
      if (existing) {
        byProject.set(s.projectId, { ...existing, sessionCount: existing.sessionCount + 1 })
        continue
      }
      byProject.set(s.projectId, {
        id: s.projectId,
        name: basename(s.cwd),
        path: s.cwd,
        sessionCount: 1
      })
    }
    return [...byProject.values()]
  }
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function needsYouCount(summaries: SessionSummary[]): number {
  const now = Date.now()
  return summaries.filter(
    (s) =>
      (s.status === 'awaiting_input' || s.status === 'awaiting_approval') &&
      now - s.lastActivityAt < 24 * 60 * 60 * 1000
  ).length
}

function upsert(list: SessionSummary[], s: SessionSummary): SessionSummary[] {
  const i = list.findIndex((x) => x.id === s.id)
  if (i < 0) return [...list, s]
  const next = list.slice()
  next[i] = s
  return next
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}
