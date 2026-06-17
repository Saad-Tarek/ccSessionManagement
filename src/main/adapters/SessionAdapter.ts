/**
 * The seam to every data source. Mock, transcript (read-only), and owned (SDK)
 * adapters all implement this. The renderer never sees raw source data — adapters
 * emit normalized SessionEvents and SessionSummaries only.
 *
 * Interactive methods are optional: observed (transcript) adapters omit them and
 * report `capabilities` with everything false, so the UI disables those controls.
 */

import type { SessionEvent } from '@shared/events'
import type { SessionSummary, Capabilities, SessionSource } from '@shared/session'

export interface OpenOptions {
  /** Tail-first paging: only events with seq >= fromSeq (omit for the latest window). */
  fromSeq?: number
}

export interface SessionAdapter {
  readonly source: SessionSource

  listSessions(): Promise<SessionSummary[]>

  /** Stream a session's normalized events. Tail-first; older via openSession({fromSeq}). */
  openSession(id: string, opts?: OpenOptions): AsyncIterable<SessionEvent>

  /** Subscribe to live summary/status updates for the sidebar. Returns unsubscribe. */
  subscribe(onChange: (summary: SessionSummary) => void): () => void

  /** What the user may do with this session. Observed sessions: all false. */
  capabilities(id: string): Capabilities

  /** Optional: re-establish any OS resources (e.g. file watchers) after the machine
   *  resumes from sleep. Called by the main process on powerMonitor 'resume'. */
  onResume?(): void

  /** Optional: remove a session. Transcript files go to the OS trash (recoverable);
   *  owned sessions are aborted and dropped. */
  deleteSession?(id: string): Promise<void>

  // Interactive — present only on adapters that own the session.
  reply?(id: string, text: string): Promise<void>
  answerQuestion?(id: string, questionId: string, choice: string): Promise<void>
  decide?(id: string, requestId: string, decision: 'approved' | 'denied'): Promise<void>
  lifecycle?(id: string, action: 'create' | 'pause' | 'resume' | 'close'): Promise<void>
}
