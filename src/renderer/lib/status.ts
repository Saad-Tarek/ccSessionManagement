import type { SessionStatus, StatusBadge } from '@shared/session'
import { STATUS_META } from '@shared/session'

export const BADGE_DOT: Record<StatusBadge, string> = {
  running: 'bg-status-running',
  waiting: 'bg-status-waiting',
  blocked: 'bg-status-blocked',
  error: 'bg-status-error',
  done: 'bg-status-done'
}

export const BADGE_TEXT: Record<StatusBadge, string> = {
  running: 'text-status-running',
  waiting: 'text-status-waiting',
  blocked: 'text-status-blocked',
  error: 'text-status-error',
  done: 'text-status-done'
}

/** Status whose dot should softly pulse to read as "live". */
export const BADGE_PULSE: Record<StatusBadge, boolean> = {
  running: true,
  waiting: true,
  blocked: true,
  error: false,
  done: false
}

export interface StatusView {
  label: string
  badge: StatusBadge
  dot: string
  text: string
  pulse: boolean
}

export function statusView(status: SessionStatus): StatusView {
  const meta = STATUS_META[status]
  return {
    label: meta.label,
    badge: meta.badge,
    dot: BADGE_DOT[meta.badge],
    text: BADGE_TEXT[meta.badge],
    pulse: BADGE_PULSE[meta.badge]
  }
}
