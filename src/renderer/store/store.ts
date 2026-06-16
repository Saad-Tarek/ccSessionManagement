import { create } from 'zustand'
import type { SessionEvent } from '@shared/events'
import type { SessionSummary, ProjectSummary, Capabilities, StatusBadge } from '@shared/session'
import { READ_ONLY_CAPABILITIES } from '@shared/session'

export interface Filter {
  query: string
  status: StatusBadge | 'all'
}

interface AppState {
  ready: boolean
  initError: string | null
  projects: ProjectSummary[]
  sessions: Record<string, SessionSummary>
  events: Record<string, SessionEvent[]>
  capabilities: Record<string, Capabilities>
  activeId: string | null
  verbose: boolean
  detailCollapsed: boolean
  filter: Filter
  toast: { id: number; message: string } | null

  init: () => Promise<void>
  refreshSessions: () => Promise<void>
  createSession: (cwd: string, prompt: string, model?: string) => Promise<void>
  select: (id: string) => Promise<void>
  applySummary: (s: SessionSummary) => void
  applyEvents: (sessionId: string, events: SessionEvent[], initial?: boolean) => void
  reply: (text: string) => Promise<void>
  answer: (questionId: string, choice: string) => Promise<void>
  decide: (requestId: string, decision: 'approved' | 'denied') => Promise<void>
  toggleVerbose: () => void
  toggleDetail: () => void
  setQuery: (query: string) => void
  setStatusFilter: (status: StatusBadge | 'all') => void
  toggleStar: (id: string) => void
  showToast: (message: string) => void
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}

let toastSeq = 0

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  initError: null,
  projects: [],
  sessions: {},
  events: {},
  capabilities: {},
  activeId: null,
  verbose: false,
  detailCollapsed: readBool('detailCollapsed', false),
  filter: { query: '', status: 'all' },
  toast: null,

  async init() {
    try {
      if (!window.api) throw new Error('window.api is undefined — the preload bridge did not load')

      // Subscribe before fetching so no pushed update is missed.
      window.api.onSummary((s) => get().applySummary(s))
      window.api.onEvents((batch) => get().applyEvents(batch.sessionId, batch.events, batch.initial))
      window.api.onFocusSession((id) => void get().select(id))
      void window.api.setNotifications(readBool('notifications', true))

      const [sessions, projects] = await Promise.all([
        window.api.listSessions(),
        window.api.listProjects()
      ])
      const byId: Record<string, SessionSummary> = {}
      for (const s of sessions) byId[s.id] = s
      set({ sessions: byId, projects, ready: true })

      // Open the most attention-worthy session first.
      const first =
        sessions.find((s) => s.pendingCount > 0) ??
        [...sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0]
      if (first) await get().select(first.id)
    } catch (err) {
      console.error('[init-failed]', err)
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      set({ ready: true, initError: message })
    }
  },

  async refreshSessions() {
    // Safety net: re-list on window focus so the sidebar can never stay empty
    // after the machine wakes from sleep (watchers may have missed events).
    try {
      const sessions = await window.api.listSessions()
      if (sessions.length === 0) return // don't blank the UI on a transient empty read
      const byId: Record<string, SessionSummary> = {}
      for (const s of sessions) byId[s.id] = s
      set({ sessions: byId })
    } catch {
      /* ignore transient failures */
    }
  },

  async createSession(cwd, prompt, model) {
    const id = await window.api.createSession({ cwd, prompt, model })
    await get().select(id)
  },

  async select(id) {
    set({ activeId: id })
    const caps = await window.api.capabilities(id)
    set((st) => ({ capabilities: { ...st.capabilities, [id]: caps } }))
    // Always (re)open so main tracks the active session and streams it live as it grows.
    await window.api.openSession({ sessionId: id })

    // Mark read locally.
    const s = get().sessions[id]
    if (s?.unread) {
      set((st) => ({ sessions: { ...st.sessions, [id]: { ...s, unread: false } } }))
      window.api.setFlag({ sessionId: id, flag: 'unread', value: false })
    }
  },

  applySummary(s) {
    set((st) => ({ sessions: { ...st.sessions, [s.id]: s } }))
  },

  applyEvents(sessionId, incoming, initial) {
    set((st) => {
      const ordered = [...incoming].sort((a, b) => a.seq - b.seq)
      if (initial) {
        // Full snapshot (open or live re-stream): replace wholesale. Avoids any
        // id/window drift, and keeps the open conversation in sync as it grows.
        return { events: { ...st.events, [sessionId]: ordered } }
      }
      const existing = st.events[sessionId] ?? []
      const seen = new Set(existing.map((e) => e.id))
      const merged = [...existing, ...ordered.filter((e) => !seen.has(e.id))]
      return { events: { ...st.events, [sessionId]: merged } }
    })
  },

  async reply(text) {
    const id = get().activeId
    if (!id) return
    appendLocal(set, id, { kind: 'message', role: 'user', text })
    patchLocal(set, get, id, { status: 'working', headline: 'thinking…' })
    await window.api.reply({ sessionId: id, text })
  },

  async answer(questionId, choice) {
    const id = get().activeId
    if (!id) return
    // Optimistic: resolve the question and echo the choice.
    set((st) => ({
      events: {
        ...st.events,
        [id]: (st.events[id] ?? []).map((e) =>
          e.kind === 'question' && e.questionId === questionId ? { ...e, answer: choice } : e
        )
      }
    }))
    appendLocal(set, id, { kind: 'message', role: 'user', text: choice })
    patchLocal(set, get, id, { status: 'working', headline: `chose: ${choice}`, pendingCount: 0 })
    await window.api.answerQuestion({ sessionId: id, questionId, choice })
  },

  async decide(requestId, decision) {
    const id = get().activeId
    if (!id) return
    set((st) => ({
      events: {
        ...st.events,
        [id]: (st.events[id] ?? []).map((e) =>
          e.kind === 'permission_request' && e.requestId === requestId ? { ...e, decision } : e
        )
      }
    }))
    patchLocal(set, get, id, {
      status: decision === 'approved' ? 'working' : 'idle',
      headline: decision === 'approved' ? 'permission approved' : 'permission denied',
      pendingCount: 0
    })
    await window.api.decide({ sessionId: id, requestId, decision })
  },

  toggleVerbose() {
    set((st) => ({ verbose: !st.verbose }))
  },
  toggleDetail() {
    set((st) => {
      const detailCollapsed = !st.detailCollapsed
      writeBool('detailCollapsed', detailCollapsed)
      return { detailCollapsed }
    })
  },
  setQuery(query) {
    set((st) => ({ filter: { ...st.filter, query } }))
  },
  setStatusFilter(status) {
    set((st) => ({ filter: { ...st.filter, status } }))
  },
  toggleStar(id) {
    const s = get().sessions[id]
    if (!s) return
    set((st) => ({ sessions: { ...st.sessions, [id]: { ...s, starred: !s.starred } } }))
    window.api.setFlag({ sessionId: id, flag: 'starred', value: !s.starred })
  },
  showToast(message) {
    const id = (toastSeq += 1)
    set({ toast: { id, message } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 1600)
  }
}))

type SetFn = (partial: (st: AppState) => Partial<AppState>) => void
type GetFn = () => AppState

function appendLocal(
  set: SetFn,
  id: string,
  input: Omit<Extract<SessionEvent, { kind: 'message' }>, 'id' | 'seq' | 'ts'>
): void {
  set((st) => {
    const all = st.events[id] ?? []
    const seq = (all[all.length - 1]?.seq ?? -1) + 1
    const event = { id: `local-${seq}`, seq, ts: Date.now(), ...input } as SessionEvent
    return { events: { ...st.events, [id]: [...all, event] } }
  })
}

function patchLocal(set: SetFn, get: GetFn, id: string, fields: Partial<SessionSummary>): void {
  const s = get().sessions[id]
  if (!s) return
  set((st) => ({ sessions: { ...st.sessions, [id]: { ...s, ...fields } } }))
}

export const capabilitiesFor = (id: string | null): Capabilities => {
  if (!id) return READ_ONLY_CAPABILITIES
  return useStore.getState().capabilities[id] ?? READ_ONLY_CAPABILITIES
}
