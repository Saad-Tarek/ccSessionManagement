import { describe, it, expect } from 'vitest'
import { computeStats, mergeStats } from './stats'
import type { SessionEvent } from './events'

const ev = (e: Partial<SessionEvent> & Pick<SessionEvent, 'kind'>, seq = 0): SessionEvent =>
  ({ id: `e${seq}`, seq, ts: 1000 + seq, ...e }) as SessionEvent

describe('computeStats', () => {
  it('aggregates tokens, cost, files, tests, tools, errors', () => {
    const events: SessionEvent[] = [
      ev({ kind: 'message', role: 'user', text: 'hi' }, 0),
      ev(
        {
          kind: 'message',
          role: 'assistant',
          text: 'ok',
          usage: { input: 1000, output: 2000, cacheRead: 5000, cacheCreate: 0 },
          model: 'claude-sonnet-4-6'
        },
        1
      ),
      ev({ kind: 'file_change', path: '/a.ts', op: 'edit' }, 2),
      ev({ kind: 'file_change', path: '/a.ts', op: 'edit' }, 3), // same file → unique 1
      ev({ kind: 'command', cmd: 'npm test', exitCode: 1 }, 4), // a failing test
      ev({ kind: 'tool_call', name: 'Read', input: {}, status: 'ok' }, 5),
      ev({ kind: 'tool_call', name: 'Edit', input: {}, status: 'error' }, 6)
    ]
    const s = computeStats(events)
    expect(s.tokens.input).toBe(1000)
    expect(s.tokens.output).toBe(2000)
    expect(s.totalTokens).toBe(8000)
    expect(s.files).toBe(1)
    expect(s.commands).toBe(1)
    expect(s.testsRun).toBe(1)
    expect(s.testsFailed).toBe(1)
    expect(s.tools).toBe(2)
    expect(s.errors).toBe(1) // the errored tool_call (failing test counts as test, not error)
    expect(s.messages).toBe(2)
    expect(s.costUsd).toBeGreaterThan(0)
    expect(s.models).toEqual(['claude-sonnet-4-6'])
  })

  it('returns zeros for an empty stream', () => {
    const s = computeStats([])
    expect(s.totalTokens).toBe(0)
    expect(s.costUsd).toBe(0)
    expect(s.files).toBe(0)
    expect(s.durationMs).toBe(0)
  })

  it('mergeStats sums independent sessions', () => {
    const a = computeStats([ev({ kind: 'command', cmd: 'ls', exitCode: 0 }, 0)])
    const b = computeStats([ev({ kind: 'command', cmd: 'ls', exitCode: 0 }, 0)])
    expect(mergeStats([a, b]).commands).toBe(2)
  })
})
