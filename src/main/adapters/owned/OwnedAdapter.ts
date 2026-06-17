import type { Query, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { SessionAdapter, OpenOptions } from '../SessionAdapter'
import type { SessionSummary, Capabilities } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import { InputStream } from './InputStream'

// The Agent SDK is ESM-only; the main process is CJS. Load it via dynamic import
// (allowed in CJS) and cache the module. Types above are erased type-only imports.
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<SdkModule> | null = null
function loadSdk(): Promise<SdkModule> {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

const COMMAND_TOOLS = new Set(['Bash', 'PowerShell', 'Shell'])
const FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<SessionEvent, 'id' | 'seq' | 'ts'>

interface Block {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface OwnedSession {
  summary: SessionSummary
  events: SessionEvent[]
  seq: number
  input: InputStream
  query: Query | null
  abort: AbortController
  pendingTool: Map<string, number>
  pendingPerms: Map<string, (r: PermissionResult) => void>
}

/**
 * Sessions the app launches and OWNS via the Claude Agent SDK. Unlike the
 * read-only transcript adapter, these are fully interactive: reply streams input
 * back in, and canUseTool drives real Approve/Deny.
 */
export class OwnedAdapter implements SessionAdapter {
  readonly source = 'owned' as const

  private sessions = new Map<string, OwnedSession>()
  private listeners = new Set<(s: SessionSummary) => void>()
  private counter = 0

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.sessions.values()].map((s) => s.summary)
  }

  async *openSession(id: string, opts?: OpenOptions): AsyncIterable<SessionEvent> {
    const s = this.sessions.get(id)
    if (!s) return
    for (const e of s.events) {
      if (opts?.fromSeq !== undefined && e.seq < opts.fromSeq) continue
      yield e
    }
  }

  capabilities(): Capabilities {
    return { canReply: true, canApprove: true, canLifecycle: true }
  }

  subscribe(onChange: (s: SessionSummary) => void): () => void {
    this.listeners.add(onChange)
    return () => this.listeners.delete(onChange)
  }

  /** Launch a new owned session. Returns its id. */
  create(cwd: string, prompt: string, model?: string): string {
    const id = `owned-${Date.now()}-${++this.counter}`
    const input = new InputStream()
    const abort = new AbortController()
    const session: OwnedSession = {
      summary: {
        id,
        projectId: cwd,
        title: prompt.slice(0, 60).trim() || 'New session',
        cwd,
        status: 'working',
        source: 'owned',
        lastActivityAt: Date.now(),
        headline: 'starting…',
        unread: false,
        starred: false,
        pendingCount: 0
      },
      events: [],
      seq: 0,
      input,
      query: null,
      abort,
      pendingTool: new Map(),
      pendingPerms: new Map()
    }
    this.sessions.set(id, session)
    this.append(session, { kind: 'message', role: 'user', text: prompt })
    input.push(prompt)

    void this.start(session, cwd, model)
    this.notify(session)
    return id
  }

  private async start(session: OwnedSession, cwd: string, model?: string): Promise<void> {
    try {
      const { query } = await loadSdk()
      const canUseTool = (
        toolName: string,
        toolInput: Record<string, unknown>,
        options: { toolUseID: string; title?: string }
      ): Promise<PermissionResult> =>
        new Promise((resolve) => {
          const requestId = options.toolUseID
          this.append(session, { kind: 'permission_request', requestId, tool: toolName, input: toolInput })
          session.pendingPerms.set(requestId, resolve)
          this.patch(session, {
            status: 'awaiting_approval',
            headline: options.title ?? `wants to use ${toolName}`,
            pendingCount: session.summary.pendingCount + 1
          })
        })

      session.query = query({
        prompt: session.input,
        options: { cwd, model, canUseTool, permissionMode: 'default', abortController: session.abort }
      })
      await this.consume(session)
    } catch (err) {
      this.append(session, { kind: 'notice', level: 'error', text: err instanceof Error ? err.message : String(err) })
      this.patch(session, { status: 'error', headline: 'failed to start' })
    }
  }

  async reply(id: string, text: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    this.append(s, { kind: 'message', role: 'user', text })
    s.input.push(text)
    this.patch(s, { status: 'working', headline: 'thinking…' })
  }

  async answerQuestion(id: string, _questionId: string, choice: string): Promise<void> {
    await this.reply(id, choice)
  }

  async decide(id: string, requestId: string, decision: 'approved' | 'denied'): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    const resolve = s.pendingPerms.get(requestId)
    if (resolve) {
      s.pendingPerms.delete(requestId)
      resolve(decision === 'approved' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied by user' })
    }
    s.events = s.events.map((e) =>
      e.kind === 'permission_request' && e.requestId === requestId ? { ...e, decision } : e
    )
    this.patch(s, {
      status: decision === 'approved' ? 'working' : 'idle',
      headline: decision === 'approved' ? 'approved — continuing' : 'denied',
      pendingCount: Math.max(0, s.summary.pendingCount - 1)
    })
  }

  async lifecycle(id: string, action: 'create' | 'pause' | 'resume' | 'close'): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    if (action === 'close' || action === 'pause') {
      try {
        await s.query?.interrupt()
      } catch {
        /* already stopping */
      }
      s.abort.abort()
      s.input.end()
      this.patch(s, { status: 'done', headline: 'closed' })
    }
  }

  async deleteSession(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    try {
      await s.query?.interrupt()
    } catch {
      /* already stopping */
    }
    s.abort.abort()
    s.input.end()
    this.sessions.delete(id)
  }

  // ── streaming ──────────────────────────────────────────────────────────────

  private async consume(session: OwnedSession): Promise<void> {
    try {
      if (!session.query) return
      for await (const msg of session.query) this.handle(session, msg)
    } catch (err) {
      this.append(session, { kind: 'notice', level: 'error', text: err instanceof Error ? err.message : String(err) })
      this.patch(session, { status: 'error', headline: 'session error' })
    } finally {
      session.input.end()
      if (session.summary.status === 'working') this.patch(session, { status: 'idle', headline: 'idle' })
    }
  }

  private handle(session: OwnedSession, msg: unknown): void {
    const m = msg as { type: string; message?: { content?: unknown; usage?: Record<string, number>; model?: string } }
    if (m.type === 'assistant' && m.message) {
      const start = session.events.length
      const blocks = Array.isArray(m.message.content) ? (m.message.content as Block[]) : []
      for (const b of blocks) this.appendBlock(session, b)
      if (m.message.usage && session.events.length > start) {
        const u = m.message.usage
        const model = m.message.model
        session.events = replaceAt(session.events, start, (e) => ({
          ...e,
          usage: {
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheCreate: u.cache_creation_input_tokens ?? 0
          },
          model
        }))
      }
      this.patch(session, { status: 'working', headline: headlineOf(session.events) })
    } else if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content as Block[]) {
        if (b.type === 'tool_result' && b.tool_use_id) this.applyResult(session, b)
      }
    } else if (m.type === 'result') {
      this.patch(session, { status: 'idle', headline: 'turn complete' })
    }
  }

  private appendBlock(session: OwnedSession, b: Block): void {
    if (b.type === 'text') {
      if (b.text?.trim()) this.append(session, { kind: 'message', role: 'assistant', text: b.text.trim() })
      return
    }
    if (b.type === 'thinking') {
      this.append(session, { kind: 'thinking' })
      return
    }
    if (b.type !== 'tool_use') return

    const name = b.name ?? 'tool'
    const input = b.input ?? {}
    let idx: number
    if (COMMAND_TOOLS.has(name)) {
      idx = this.append(session, { kind: 'command', cmd: String(input.command ?? '') })
    } else if (FILE_TOOLS.has(name)) {
      const path = String(input.file_path ?? input.path ?? '')
      idx =
        name === 'Write'
          ? this.append(session, { kind: 'file_change', path, op: 'create', newText: cap(String(input.content ?? '')) })
          : this.append(session, {
              kind: 'file_change',
              path,
              op: 'edit',
              oldText: cap(String(input.old_string ?? '')),
              newText: cap(String(input.new_string ?? ''))
            })
    } else if (name === 'AskUserQuestion') {
      const q = firstQuestion(input)
      idx = this.append(session, { kind: 'question', questionId: b.id ?? `q${session.seq}`, prompt: q.prompt, options: q.options })
    } else if (SUBAGENT_TOOLS.has(name)) {
      idx = this.append(session, {
        kind: 'subagent',
        task: String(input.description ?? 'subagent'),
        agentType: input.subagent_type ? String(input.subagent_type) : undefined,
        sessionRef: b.id ?? ''
      })
    } else {
      idx = this.append(session, { kind: 'tool_call', name, input, status: 'pending' })
    }
    if (b.id) session.pendingTool.set(b.id, idx)
  }

  private applyResult(session: OwnedSession, b: Block): void {
    const idx = session.pendingTool.get(b.tool_use_id as string)
    if (idx === undefined) return
    const text = resultText(b)
    const isError = b.is_error === true
    const ev = session.events[idx]
    if (ev.kind === 'command') {
      session.events = replaceAt(session.events, idx, (e) => ({ ...e, exitCode: isError ? 1 : 0, stderr: isError ? text : undefined }))
    } else if (ev.kind === 'tool_call') {
      session.events = replaceAt(session.events, idx, (e) => ({ ...e, status: isError ? 'error' : 'ok', result: text }))
    } else if (ev.kind === 'question') {
      session.events = replaceAt(session.events, idx, (e) => ({ ...e, answer: text || undefined }))
    }
    this.notify(session)
  }

  private append(session: OwnedSession, ev: EventInput): number {
    const idx = session.events.length
    session.events = [...session.events, { id: `o${session.seq}`, seq: session.seq, ts: Date.now(), ...ev } as SessionEvent]
    session.seq++
    this.patch(session, {})
    return idx
  }

  private patch(session: OwnedSession, fields: Partial<SessionSummary>): void {
    session.summary = { ...session.summary, lastActivityAt: Date.now(), ...fields }
    this.notify(session)
  }

  private notify(session: OwnedSession): void {
    this.listeners.forEach((fn) => fn(session.summary))
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a new array with the event at `idx` replaced by `update(event)`. The
 * events are streamed live to the renderer, so we rebuild the array (new ref)
 * rather than mutating in place — mirrors `decide`, keeps Zustand re-folding.
 */
function replaceAt(
  events: SessionEvent[],
  idx: number,
  update: (event: SessionEvent) => SessionEvent
): SessionEvent[] {
  return events.map((event, i) => (i === idx ? update(event) : event))
}

function cap(value: string, max = 4000): string {
  return value.length > max ? value.slice(0, max) + '\n…(truncated)' : value
}

function resultText(b: Block): string {
  const c = b.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((p) => (p as { text?: string }).text ?? '').join('')
  return ''
}

function firstQuestion(input: Record<string, unknown>): {
  prompt: string
  options?: Array<{ label: string; description?: string }>
} {
  const questions = input.questions
  if (Array.isArray(questions) && questions.length > 0) {
    const q = questions[0] as Record<string, unknown>
    const options = Array.isArray(q.options)
      ? (q.options as Array<Record<string, unknown>>).map((o) => ({
          label: String(o.label ?? ''),
          description: o.description ? String(o.description) : undefined
        }))
      : undefined
    return { prompt: String(q.question ?? 'Agent asked a question'), options }
  }
  return { prompt: 'Agent asked a question' }
}

function headlineOf(events: SessionEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind === 'command') return `running: ${e.cmd.slice(0, 60)}`
    if (e.kind === 'file_change') return `${e.op === 'create' ? 'creating' : 'editing'} ${e.path.split(/[\\/]/).pop()}`
    if (e.kind === 'message' && e.role === 'assistant') return e.text.replace(/\s+/g, ' ').slice(0, 70)
    if (e.kind === 'tool_call') return `${e.name}…`
  }
  return undefined
}
