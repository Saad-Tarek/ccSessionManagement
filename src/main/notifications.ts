import { Notification, type BrowserWindow } from 'electron'
import type { SessionSummary, SessionStatus } from '@shared/session'

type Send = (channel: string, payload: unknown) => void

function projectName(s: SessionSummary): string {
  const parts = s.cwd.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? s.title
}

/**
 * Fires a native OS notification when a session transitions INTO an attention
 * state (needs input, needs approval, error). Only transitions notify — the initial
 * status learned at startup is seeded silently so launching never spams.
 */
export class NotificationManager {
  private prev = new Map<string, SessionStatus>()
  private enabled = true

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly send: Send,
    private readonly focusChannel: string
  ) {}

  setEnabled(value: boolean): void {
    this.enabled = value
  }

  /** Record current statuses without notifying (called after the initial list). */
  seed(summaries: SessionSummary[]): void {
    for (const s of summaries) if (!this.prev.has(s.id)) this.prev.set(s.id, s.status)
  }

  onSummary(s: SessionSummary): void {
    const prev = this.prev.get(s.id)
    this.prev.set(s.id, s.status)
    if (!this.enabled || !Notification.isSupported() || prev === undefined || prev === s.status) return

    const content = this.build(s)
    if (!content) return

    const notification = new Notification(content)
    notification.on('click', () => {
      const w = this.getWindow()
      if (w) {
        w.show()
        w.focus()
      }
      this.send(this.focusChannel, s.id)
    })
    notification.show()
  }

  private build(s: SessionSummary): { title: string; body: string } | null {
    const name = projectName(s)
    switch (s.status) {
      case 'awaiting_input':
        return { title: `${name} is asking`, body: s.headline ?? 'Needs your input' }
      case 'awaiting_approval':
        return { title: `${name} needs approval`, body: s.headline ?? 'Wants to run an action' }
      case 'error':
        return { title: `${name} hit an error`, body: s.headline ?? '' }
      default:
        return null
    }
  }
}
