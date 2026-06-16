/**
 * Raw shapes of Claude Code transcript JSONL entries (`~/.claude/projects/<dir>/<id>.jsonl`).
 * Deliberately loose/optional — transcripts mix many entry kinds and versions.
 * `normalize.ts` is the only place that should depend on these.
 */

export interface RawContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | string
  // text
  text?: string
  // thinking
  thinking?: string
  // tool_use
  id?: string
  name?: string
  input?: Record<string, unknown>
  // tool_result
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
}

export interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface RawMessage {
  role?: 'user' | 'assistant'
  content?: string | RawContentBlock[]
  model?: string
  usage?: RawUsage
}

export interface RawToolUseResult {
  stdout?: string
  stderr?: string
  interrupted?: boolean
  isImage?: boolean
}

export interface RawEntry {
  type: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  sessionId?: string
  cwd?: string
  gitBranch?: string
  version?: string
  isSidechain?: boolean
  isMeta?: boolean
  userType?: string
  message?: RawMessage
  toolUseResult?: RawToolUseResult | string | unknown
  // ai-title entries
  aiTitle?: string
}

export const TEXT_ENTRY_TYPES = new Set(['user', 'assistant'])
