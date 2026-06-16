import type { SessionAdapter, OpenOptions } from './SessionAdapter'
import type { SessionSummary, Capabilities } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import { OwnedAdapter } from './owned/OwnedAdapter'

/**
 * Presents observed (transcript) and owned (SDK) sessions as one adapter. Owned
 * session ids are prefixed `owned-`; everything else delegates to the base.
 */
export class CompositeAdapter implements SessionAdapter {
  readonly source = 'transcript' as const
  readonly owned = new OwnedAdapter()

  constructor(private readonly base: SessionAdapter) {}

  private route(id: string): SessionAdapter {
    return id.startsWith('owned-') ? this.owned : this.base
  }

  async listSessions(): Promise<SessionSummary[]> {
    const [owned, base] = await Promise.all([this.owned.listSessions(), this.base.listSessions()])
    return [...owned, ...base]
  }

  openSession(id: string, opts?: OpenOptions): AsyncIterable<SessionEvent> {
    return this.route(id).openSession(id, opts)
  }

  capabilities(id: string): Capabilities {
    return this.route(id).capabilities(id)
  }

  subscribe(onChange: (s: SessionSummary) => void): () => void {
    const unBase = this.base.subscribe(onChange)
    const unOwned = this.owned.subscribe(onChange)
    return () => {
      unBase()
      unOwned()
    }
  }

  reply(id: string, text: string): Promise<void> {
    return this.route(id).reply?.(id, text) ?? Promise.resolve()
  }

  answerQuestion(id: string, questionId: string, choice: string): Promise<void> {
    return this.route(id).answerQuestion?.(id, questionId, choice) ?? Promise.resolve()
  }

  decide(id: string, requestId: string, decision: 'approved' | 'denied'): Promise<void> {
    return this.route(id).decide?.(id, requestId, decision) ?? Promise.resolve()
  }

  lifecycle(id: string, action: 'create' | 'pause' | 'resume' | 'close'): Promise<void> {
    return this.route(id).lifecycle?.(id, action) ?? Promise.resolve()
  }

  onResume(): void {
    this.base.onResume?.()
  }

  /** Launch a new owned session; returns its id. */
  createOwned(cwd: string, prompt: string, model?: string): string {
    return this.owned.create(cwd, prompt, model)
  }
}
