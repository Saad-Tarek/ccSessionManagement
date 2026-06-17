/**
 * The typed IPC surface between renderer and main. `invoke`/`handle` for
 * request-response; main->renderer push for the two live streams (events + summaries).
 *
 * NOTE: `RendererApi` here is the canonical target exposed on `window.api`. The
 * Phase 1 preload exposes a placeholder subset; task #7 wires this full contract.
 */

import type { SessionEvent } from './events'
import type { SessionSummary, ProjectSummary, Capabilities } from './session'
import type { InsightsResult } from './stats'

export const IpcChannel = {
  // request / response (renderer -> main)
  listProjects: 'sessions:listProjects',
  listSessions: 'sessions:listSessions',
  openSession: 'sessions:open',
  closeSession: 'sessions:close',
  loadOlder: 'sessions:loadOlder',
  capabilities: 'sessions:capabilities',
  reply: 'sessions:reply',
  answerQuestion: 'sessions:answerQuestion',
  decide: 'sessions:decide',
  lifecycle: 'sessions:lifecycle',
  setFlag: 'sessions:setFlag',
  search: 'sessions:search',
  getInsights: 'app:getInsights',
  createSession: 'sessions:create',
  pickDirectory: 'app:pickDirectory',
  copyText: 'clipboard:write',
  setNotifications: 'app:setNotifications',
  installUpdate: 'app:installUpdate',
  appInfo: 'app:info',
  quit: 'app:quit',
  windowMinimize: 'win:minimize',
  windowMaximizeToggle: 'win:maximizeToggle',
  windowClose: 'win:close',
  // push (main -> renderer)
  onEvents: 'stream:events',
  onSummary: 'stream:summary',
  focusSession: 'app:focusSession',
  updateReady: 'app:updateReady'
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

export interface SessionEventBatch {
  sessionId: string
  events: SessionEvent[]
  /** True when this batch completes the initial tail load. */
  initial?: boolean
}

export type FlagKind = 'unread' | 'starred' | 'pinned'

export interface SearchHit {
  sessionId: string
  title: string
  snippet: string
  score: number
}

export interface OpenSessionRequest {
  sessionId: string
}
export interface LoadOlderRequest {
  sessionId: string
  beforeSeq: number
  limit?: number
}
export interface ReplyRequest {
  sessionId: string
  text: string
}
export interface AnswerQuestionRequest {
  sessionId: string
  questionId: string
  choice: string
}
export interface DecideRequest {
  sessionId: string
  requestId: string
  decision: 'approved' | 'denied'
}
export interface LifecycleRequest {
  sessionId: string
  action: 'create' | 'pause' | 'resume' | 'close'
}
export interface SetFlagRequest {
  sessionId: string
  flag: FlagKind
  value: boolean
}

export interface CreateSessionRequest {
  cwd: string
  prompt: string
  model?: string
}

/** Emitted once an update has been downloaded and is ready to install on restart. */
export interface UpdateReadyInfo {
  version: string
}

/** Static app identity for the About dialog. */
export interface AppInfo {
  name: string
  version: string
}

/** The full shape exposed on `window.api`. Implemented incrementally per phase. */
export interface RendererApi {
  listProjects(): Promise<ProjectSummary[]>
  listSessions(): Promise<SessionSummary[]>
  openSession(req: OpenSessionRequest): Promise<void>
  closeSession(sessionId: string): Promise<void>
  loadOlder(req: LoadOlderRequest): Promise<SessionEvent[]>
  capabilities(sessionId: string): Promise<Capabilities>
  reply(req: ReplyRequest): Promise<void>
  answerQuestion(req: AnswerQuestionRequest): Promise<void>
  decide(req: DecideRequest): Promise<void>
  lifecycle(req: LifecycleRequest): Promise<void>
  setFlag(req: SetFlagRequest): Promise<void>
  search(query: string): Promise<SearchHit[]>
  getInsights(): Promise<InsightsResult>
  createSession(req: CreateSessionRequest): Promise<string>
  pickDirectory(): Promise<string | null>
  copyText(text: string): Promise<void>
  setNotifications(enabled: boolean): Promise<void>
  /** Quit and install a downloaded update. */
  installUpdate(): Promise<void>
  /** App name + version for the About dialog. */
  appInfo(): Promise<AppInfo>
  /** Quit the app entirely (not just hide to tray). */
  quit(): Promise<void>
  /** True on macOS — the renderer skips custom window controls (traffic-lights are native). */
  readonly isMac: boolean
  minimizeWindow(): Promise<void>
  maximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  /** Subscribe to the per-session event stream. Returns an unsubscribe fn. */
  onEvents(handler: (batch: SessionEventBatch) => void): () => void
  /** Subscribe to live sidebar summary updates. Returns an unsubscribe fn. */
  onSummary(handler: (summary: SessionSummary) => void): () => void
  /** Fired when the user clicks a notification — focus that session. */
  onFocusSession(handler: (sessionId: string) => void): () => void
  /** Fired when a downloaded update is ready to install. Returns an unsubscribe fn. */
  onUpdateReady(handler: (info: UpdateReadyInfo) => void): () => void
}
