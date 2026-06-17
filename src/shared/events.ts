/**
 * The normalized event taxonomy. Every adapter (mock, transcript, owned) maps its
 * raw source into an append-only stream of these. The renderer only ever folds
 * these — it never sees raw transcript JSONL. Keep this union the contract.
 */

import type { SessionStatus } from './session'

export type SessionEventKind =
  | 'message'
  | 'thinking'
  | 'tool_call'
  | 'command'
  | 'file_change'
  | 'question'
  | 'permission_request'
  | 'subagent'
  | 'state_transition'
  | 'notice'
  | 'compaction'

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
}

interface BaseEvent {
  /** Stable id within the session; also the React key. */
  id: string
  /** Monotonic sequence within the session — ordering and tail-first range loads. */
  seq: number
  /** Epoch ms. */
  ts: number
  kind: SessionEventKind
  /** Set on the first event of each assistant turn that reported token usage. */
  usage?: TokenUsage
  model?: string
}

export interface MessageEvent extends BaseEvent {
  kind: 'message'
  role: 'user' | 'assistant'
  text: string
}

/** Hidden by default; surfaced via the verbose toggle. */
export interface ThinkingEvent extends BaseEvent {
  kind: 'thinking'
  durationMs?: number
  text?: string
}

export interface ToolCallEvent extends BaseEvent {
  kind: 'tool_call'
  name: string
  input: unknown
  status: 'pending' | 'ok' | 'error'
  result?: string
  durationMs?: number
}

/** Specialized tool_call for shell commands (Bash/PowerShell). */
export interface CommandEvent extends BaseEvent {
  kind: 'command'
  cmd: string
  cwd?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

export interface FileChangeEvent extends BaseEvent {
  kind: 'file_change'
  path: string
  op: 'create' | 'edit' | 'delete'
  added?: number
  removed?: number
  /** Before/after snippets (Edit) or new content (Write), capped for display. */
  oldText?: string
  newText?: string
}

export interface QuestionOption {
  label: string
  description?: string
}

/** An AskUserQuestion the agent posed. `answer` set once resolved. */
export interface QuestionEvent extends BaseEvent {
  kind: 'question'
  questionId: string
  prompt: string
  options?: QuestionOption[]
  answer?: string
}

/** A permission/approval request. Only ever present for owned or hook-fed sessions. */
export interface PermissionRequestEvent extends BaseEvent {
  kind: 'permission_request'
  requestId: string
  tool: string
  input: unknown
  decision?: 'approved' | 'denied'
}

/** A nested subagent run; expands into its own mini event stream in the feed. */
export interface SubagentEvent extends BaseEvent {
  kind: 'subagent'
  agentType?: string
  task: string
  sessionRef: string
}

export interface StateTransitionEvent extends BaseEvent {
  kind: 'state_transition'
  from: SessionStatus
  to: SessionStatus
  reason?: string
}

export interface NoticeEvent extends BaseEvent {
  kind: 'notice'
  level: 'info' | 'warn' | 'error'
  text: string
}

/**
 * A context-compaction boundary. Claude summarizes the conversation so far and
 * continues; the messages above this marker are the preserved pre-compaction
 * history (never deleted from the transcript). `summary` is the injected recap.
 */
export interface CompactionEvent extends BaseEvent {
  kind: 'compaction'
  trigger: 'manual' | 'auto' | 'unknown'
  preTokens?: number
  summary?: string
}

export type SessionEvent =
  | MessageEvent
  | ThinkingEvent
  | ToolCallEvent
  | CommandEvent
  | FileChangeEvent
  | QuestionEvent
  | PermissionRequestEvent
  | SubagentEvent
  | StateTransitionEvent
  | NoticeEvent
  | CompactionEvent

/** Events the user must act on — drive the Needs-you tray and pendingCount. */
export function isPending(e: SessionEvent): e is QuestionEvent | PermissionRequestEvent {
  return (
    (e.kind === 'question' && e.answer === undefined) ||
    (e.kind === 'permission_request' && e.decision === undefined)
  )
}

/** Events hidden from the calm feed unless the verbose toggle is on. */
export function isVerboseOnly(e: SessionEvent): boolean {
  return e.kind === 'thinking' || e.kind === 'state_transition'
}
