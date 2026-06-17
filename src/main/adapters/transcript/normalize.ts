/**
 * The heart of the transcript adapter: turn raw, noisy JSONL entries into the
 * clean normalized SessionEvent stream the UI folds. Pure and total.
 *
 * Responsibilities:
 *  - pair tool_use with its later tool_result (status / result / answer)
 *  - specialize Bash/PowerShell -> command, Edit/Write -> file_change,
 *    AskUserQuestion -> question, Agent/Task -> subagent
 *  - drop noise (hook attachments, file snapshots, mode/title/meta entries)
 *  - clean slash-command wrappers in user text
 */

import type { SessionEvent, TokenUsage } from '@shared/events'
import type { RawEntry, RawContentBlock, RawToolUseResult, RawUsage } from './types'

const COMMAND_TOOLS = new Set(['Bash', 'PowerShell', 'Shell'])
const FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])

// Distributive omit preserves each union member's fields (plain Omit collapses them).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type EventInput = DistributiveOmit<SessionEvent, 'id' | 'seq'>

interface Pending {
  index: number
  kind: SessionEvent['kind']
}

export function normalize(entries: RawEntry[]): SessionEvent[] {
  const events: SessionEvent[] = []
  const pendingByToolUseId = new Map<string, Pending>()
  let seq = 0
  let lastTs = 0

  const tsOf = (e: RawEntry): number => {
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN
    if (!Number.isNaN(t)) {
      lastTs = t
      return t
    }
    return (lastTs += 1)
  }

  const push = (ev: EventInput): number => {
    const index = events.length
    events.push({ id: `t${seq}`, seq, ...ev } as SessionEvent)
    seq++
    return index
  }

  const patch = (index: number, fields: Record<string, unknown>): void => {
    events[index] = { ...events[index], ...fields } as SessionEvent
  }

  for (const entry of entries) {
    if (entry.isMeta) continue
    const role = entry.message?.role
    if (entry.type !== 'user' && entry.type !== 'assistant') continue

    const ts = tsOf(entry)
    const content = entry.message?.content

    // ── user: plain text prompt, or an array of tool_results to attach ──────
    if (entry.type === 'user') {
      if (typeof content === 'string') {
        const text = cleanUserText(content)
        if (text) push({ kind: 'message', ts, role: 'user', text })
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            attachResult(block, entry.toolUseResult, pendingByToolUseId, patch)
          } else if (block.type === 'text' && block.text?.trim()) {
            push({ kind: 'message', ts, role: 'user', text: block.text.trim() })
          }
        }
      }
      continue
    }

    // ── assistant: text / thinking / tool_use blocks ────────────────────────
    const startIndex = events.length
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          if (block.text?.trim()) push({ kind: 'message', ts, role: 'assistant', text: block.text.trim() })
        } else if (block.type === 'thinking') {
          push({ kind: 'thinking', ts })
        } else if (block.type === 'tool_use') {
          const index = pushToolUse(block, ts, role, push)
          if (index >= 0 && block.id) {
            pendingByToolUseId.set(block.id, { index, kind: events[index].kind })
          }
        }
      }
    } else if (typeof content === 'string' && content.trim()) {
      push({ kind: 'message', ts, role: 'assistant', text: content.trim() })
    }

    // Attach this assistant turn's token usage to its first emitted event.
    const usage = entry.message?.usage
    if (usage && events.length > startIndex) {
      events[startIndex] = {
        ...events[startIndex],
        usage: mapUsage(usage),
        model: entry.message?.model
      } as SessionEvent
    }
  }

  return events
}

function mapUsage(u: RawUsage): TokenUsage {
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0
  }
}

function pushToolUse(
  block: RawContentBlock,
  ts: number,
  _role: 'user' | 'assistant' | undefined,
  push: (ev: EventInput) => number
): number {
  const name = block.name ?? 'tool'
  const input = (block.input ?? {}) as Record<string, unknown>

  if (COMMAND_TOOLS.has(name)) {
    return push({ kind: 'command', ts, cmd: String(input.command ?? '') })
  }
  if (FILE_TOOLS.has(name)) {
    const path = String(input.file_path ?? input.path ?? input.notebook_path ?? '')
    if (name === 'Write') {
      const content = typeof input.content === 'string' ? input.content : ''
      return push({ kind: 'file_change', ts, path, op: 'create', added: countLines(content), newText: cap(content) })
    }
    const oldStr = typeof input.old_string === 'string' ? input.old_string : ''
    const newStr = typeof input.new_string === 'string' ? input.new_string : ''
    return push({
      kind: 'file_change',
      ts,
      path,
      op: 'edit',
      added: countLines(newStr),
      removed: countLines(oldStr),
      oldText: cap(oldStr),
      newText: cap(newStr)
    })
  }
  if (name === 'AskUserQuestion') {
    const q = firstQuestion(input)
    return push({
      kind: 'question',
      ts,
      questionId: block.id ?? `q${ts}`,
      prompt: q.prompt,
      options: q.options
    })
  }
  if (SUBAGENT_TOOLS.has(name)) {
    return push({
      kind: 'subagent',
      ts,
      task: String(input.description ?? input.prompt ?? 'subagent task'),
      agentType: input.subagent_type ? String(input.subagent_type) : undefined,
      sessionRef: block.id ?? ''
    })
  }
  return push({ kind: 'tool_call', ts, name, input, status: 'pending' })
}

function attachResult(
  block: RawContentBlock,
  toolUseResult: RawEntry['toolUseResult'],
  pending: Map<string, Pending>,
  patch: (index: number, fields: Record<string, unknown>) => void
): void {
  const p = pending.get(block.tool_use_id as string)
  if (!p) return
  const isError = block.is_error === true
  const text = resultText(block)
  const tur = typeof toolUseResult === 'object' ? (toolUseResult as RawToolUseResult) : undefined

  switch (p.kind) {
    case 'command':
      patch(p.index, {
        exitCode: isError ? 1 : 0,
        stderr: isError ? (tur?.stderr ?? text) : undefined,
        stdout: tur?.stdout
      })
      break
    case 'tool_call':
      patch(p.index, { status: isError ? 'error' : 'ok', result: text })
      break
    case 'question':
      patch(p.index, { answer: text || undefined })
      break
    default:
      // file_change / subagent: nothing to attach
      break
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

// Wrappers Claude Code injects around local commands (`! cmd`), their captured
// output, and hook/caveat attachments. None of these are the user talking, so
// they're dropped from the conversation rather than shown as messages.
const NOISE_MARKERS = [
  '<bash-input>',
  '<bash-stdout>',
  '<bash-stderr>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<command-message>'
]

function cleanUserText(raw: string): string | null {
  // A real slash command (`/foo bar`) — surface it as a clean label.
  const name = raw.match(/<command-name>([^<]*)<\/command-name>/)?.[1]?.trim()
  if (name) {
    const args = raw.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
    return args ? `${name} ${args}` : name
  }
  // Local `! command` runs, their stdout/stderr, and hook/caveat noise.
  if (NOISE_MARKERS.some((marker) => raw.includes(marker))) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resultText(block: RawContentBlock): string {
  const c = block.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((p) => p.text ?? '').join('')
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

function countLines(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return 0
  return value.split('\n').length
}

function cap(value: string, max = 4000): string {
  return value.length > max ? value.slice(0, max) + '\n…(truncated)' : value
}
