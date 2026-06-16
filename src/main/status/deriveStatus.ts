/**
 * Pure session-status state machine.
 *
 * The transcript contains no status field, so status is DERIVED from the tail of
 * the normalized event stream plus the file's last-activity time. `awaiting_approval`
 * (a pending permission) is invisible in the transcript, so we only report it when the
 * optional status hook supplies `hookSignal` — we deliberately do NOT guess "blocked"
 * from a stalled tool, to avoid false alarms. Likewise, "working" requires a genuine
 * in-progress signal: a trailing assistant message ends a turn and reads as idle, even
 * if the file was just touched (an open terminal session waiting for the user).
 *
 * Keep this function pure and total: inject `now` rather than reading the clock.
 */

import type { SessionEvent } from '@shared/events'
import type { SessionStatus } from '@shared/session'

export type HookSignal = 'needs_approval' | 'needs_input' | 'stopped' | 'working'

export interface StatusInput {
  /** Recent events, oldest → newest. A small tail is sufficient. */
  recentEvents: SessionEvent[]
  /** Epoch ms of the last activity (file mtime or last event ts). */
  lastActivityAt: number
  /** Injected "now" (epoch ms) for deterministic testing. */
  now: number
  /** Authoritative signal from the status hook, when installed. */
  hookSignal?: HookSignal
  /** Owned sessions only: the process has exited. */
  ended?: boolean
  /** Inactivity (ms) after which a working session is considered idle / a tool stalled. */
  idleAfterMs?: number
}

const DEFAULT_IDLE_AFTER_MS = 60_000

/** Find the last event that carries status meaning (skips verbose-only noise). */
function lastMeaningful(events: SessionEvent[]): SessionEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind === 'thinking' || e.kind === 'state_transition' || e.kind === 'notice') {
      if (e.kind === 'notice' && e.level === 'error') return e // errors still count
      continue
    }
    return e
  }
  return undefined
}

export function deriveStatus(input: StatusInput): SessionStatus {
  const { recentEvents, lastActivityAt, now, hookSignal, ended } = input
  const idleAfterMs = input.idleAfterMs ?? DEFAULT_IDLE_AFTER_MS
  const stale = now - lastActivityAt > idleAfterMs

  // 1. Terminal: an owned process that exited.
  if (ended) return 'done'

  // 2. Authoritative hook signal wins over inference (except 'stopped', which
  //    only tells us the turn ended — fall through to decide idle vs done).
  if (hookSignal === 'needs_approval') return 'awaiting_approval'
  if (hookSignal === 'needs_input') return 'awaiting_input'
  if (hookSignal === 'working') return 'working'

  const last = lastMeaningful(recentEvents)
  if (!last) return 'idle'

  // 3. States that hold regardless of how long ago they happened.
  if (last.kind === 'question' && last.answer === undefined) return 'awaiting_input'
  if (last.kind === 'permission_request' && last.decision === undefined) return 'awaiting_approval'
  if (last.kind === 'tool_call' && last.status === 'error') return 'error'
  if (last.kind === 'command' && last.exitCode !== undefined && last.exitCode !== 0) return 'error'
  if (last.kind === 'notice' && last.level === 'error') return 'error'

  // 4. No recent file activity -> the agent isn't doing anything now. Idle/ready.
  if (stale) return 'idle'

  // 5. Recently active: "working" means mid-turn, NOT "the agent just finished talking".
  //    A trailing assistant message is the END of a turn, so the session is idle/ready
  //    even if the transcript file was touched seconds ago (e.g. an open terminal session
  //    the user hasn't replied to yet). Only genuine in-progress signals read as working.
  if (last.kind === 'message') return last.role === 'assistant' ? 'idle' : 'working'
  return 'working'
}
