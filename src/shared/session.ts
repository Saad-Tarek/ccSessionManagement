/**
 * Session & project domain types. Shared verbatim between the Electron main
 * process (adapters/persistence) and the renderer (store/UI). Single source of truth.
 */

export type SessionSource = 'mock' | 'transcript' | 'owned'

/**
 * Internal status. Maps onto the five user-facing badges. `awaiting_approval` is
 * the only state that needs the optional hook to be authoritative — see deriveStatus.
 */
export type SessionStatus =
  | 'working' // running
  | 'awaiting_input' // waiting — agent asked a question
  | 'awaiting_approval' // blocked — pending permission (hook-only authoritative)
  | 'error' // error
  | 'idle' // done badge — turn finished, session still open
  | 'done' // done badge — session ended/closed

export type StatusBadge = 'running' | 'waiting' | 'blocked' | 'error' | 'done'

export const STATUS_META: Record<SessionStatus, { label: string; badge: StatusBadge }> = {
  working: { label: 'Running', badge: 'running' },
  awaiting_input: { label: 'Waiting', badge: 'waiting' },
  awaiting_approval: { label: 'Blocked', badge: 'blocked' },
  error: { label: 'Error', badge: 'error' },
  idle: { label: 'Idle', badge: 'done' },
  done: { label: 'Done', badge: 'done' }
}

/** Whether a session can be acted on. Observed (transcript) sessions are all false. */
export interface Capabilities {
  canReply: boolean
  canApprove: boolean
  canLifecycle: boolean
}

export const READ_ONLY_CAPABILITIES: Capabilities = {
  canReply: false,
  canApprove: false,
  canLifecycle: false
}

export interface ProjectSummary {
  /** Stable id derived from the repo root / cwd. */
  id: string
  /** Display name — basename of the repo root. */
  name: string
  /** Absolute path to the repo root (fallback: cwd). */
  path: string
  sessionCount: number
}

export interface SessionSummary {
  id: string
  projectId: string
  /** AI-generated title when available; otherwise first prompt / fallback. */
  title: string
  cwd: string
  gitBranch?: string
  status: SessionStatus
  source: SessionSource
  /** Epoch ms of the last activity — drives sidebar ordering. */
  lastActivityAt: number
  /** One-line "currently: editing X" / "asked: …?" headline for the tile. */
  headline?: string
  unread: boolean
  starred: boolean
  /** Pending questions + approvals; feeds the global Needs-you tray and badge. */
  pendingCount: number
}
