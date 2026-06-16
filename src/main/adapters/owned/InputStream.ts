import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

/**
 * A push-driven async iterable of user messages for the Agent SDK's streaming
 * input mode. The initial prompt and every later reply are pushed in; the SDK
 * consumes them as the conversation advances. Streaming input is what unlocks
 * the control methods (interrupt / setModel) and multi-turn replies.
 */
export class InputStream implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private waiting: Array<(r: IteratorResult<SDKUserMessage>) => void> = []
  private ended = false

  push(text: string): void {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    } as SDKUserMessage
    const resolve = this.waiting.shift()
    if (resolve) resolve({ value: msg, done: false })
    else this.queue.push(msg)
  }

  end(): void {
    this.ended = true
    let resolve = this.waiting.shift()
    while (resolve) {
      resolve({ value: undefined as never, done: true })
      resolve = this.waiting.shift()
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    for (;;) {
      const queued = this.queue.shift()
      if (queued) {
        yield queued
        continue
      }
      if (this.ended) return
      const result = await new Promise<IteratorResult<SDKUserMessage>>((resolve) =>
        this.waiting.push(resolve)
      )
      if (result.done) return
      yield result.value
    }
  }
}
