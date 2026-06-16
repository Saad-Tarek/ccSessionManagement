import { describe, it, expect } from 'vitest'
import type { SessionEvent } from '@shared/events'
import { deriveStatus, type StatusInput } from './deriveStatus'

const NOW = 1_000_000_000_000
const FRESH = NOW - 5_000 // within the idle window
const STALE = NOW - 120_000 // beyond the 60s idle window

let seq = 0
const ev = (e: Partial<SessionEvent> & Pick<SessionEvent, 'kind'>): SessionEvent =>
  ({ id: `e${seq}`, seq: seq++, ts: FRESH, ...e }) as SessionEvent

const input = (recentEvents: SessionEvent[], over: Partial<StatusInput> = {}): StatusInput => ({
  recentEvents,
  lastActivityAt: FRESH,
  now: NOW,
  ...over
})

describe('deriveStatus', () => {
  it('returns idle for an empty stream', () => {
    expect(deriveStatus(input([]))).toBe('idle')
  })

  it('returns done when an owned process has ended', () => {
    expect(deriveStatus(input([ev({ kind: 'message', role: 'assistant', text: 'hi' })], { ended: true }))).toBe('done')
  })

  describe('authoritative hook signal', () => {
    it('maps needs_approval → awaiting_approval', () => {
      expect(deriveStatus(input([], { hookSignal: 'needs_approval' }))).toBe('awaiting_approval')
    })
    it('maps needs_input → awaiting_input', () => {
      expect(deriveStatus(input([], { hookSignal: 'needs_input' }))).toBe('awaiting_input')
    })
    it('maps working → working even if events look idle', () => {
      expect(
        deriveStatus(input([ev({ kind: 'message', role: 'assistant', text: 'done' })], {
          hookSignal: 'working',
          lastActivityAt: STALE
        }))
      ).toBe('working')
    })
  })

  describe('questions', () => {
    it('unanswered question → awaiting_input', () => {
      expect(
        deriveStatus(input([ev({ kind: 'question', questionId: 'q1', prompt: 'which db?' })]))
      ).toBe('awaiting_input')
    })
    it('answered question, stale → idle', () => {
      expect(
        deriveStatus(
          input([ev({ kind: 'question', questionId: 'q1', prompt: 'which db?', answer: 'postgres' })], {
            lastActivityAt: STALE
          })
        )
      ).toBe('idle')
    })
  })

  describe('permission requests', () => {
    it('undecided permission_request → awaiting_approval', () => {
      expect(
        deriveStatus(input([ev({ kind: 'permission_request', requestId: 'r1', tool: 'Bash', input: {} })]))
      ).toBe('awaiting_approval')
    })
    it('decided permission_request, fresh → working', () => {
      expect(
        deriveStatus(
          input([ev({ kind: 'permission_request', requestId: 'r1', tool: 'Bash', input: {}, decision: 'approved' })])
        )
      ).toBe('working')
    })
  })

  describe('tool calls', () => {
    it('pending tool_call, fresh → working', () => {
      expect(deriveStatus(input([ev({ kind: 'tool_call', name: 'Read', input: {}, status: 'pending' })]))).toBe(
        'working'
      )
    })
    it('pending tool_call, stale → idle (no false "blocked" without the hook)', () => {
      expect(
        deriveStatus(
          input([ev({ kind: 'tool_call', name: 'Bash', input: {}, status: 'pending' })], { lastActivityAt: STALE })
        )
      ).toBe('idle')
    })
    it('errored tool_call → error', () => {
      expect(deriveStatus(input([ev({ kind: 'tool_call', name: 'Edit', input: {}, status: 'error' })]))).toBe('error')
    })
  })

  describe('commands', () => {
    it('non-zero exit → error', () => {
      expect(deriveStatus(input([ev({ kind: 'command', cmd: 'npm test', exitCode: 1 })]))).toBe('error')
    })
    it('zero exit, fresh → working', () => {
      expect(deriveStatus(input([ev({ kind: 'command', cmd: 'npm test', exitCode: 0 })]))).toBe('working')
    })
  })

  describe('messages', () => {
    it('assistant message, fresh → idle (turn finished, agent is waiting)', () => {
      expect(deriveStatus(input([ev({ kind: 'message', role: 'assistant', text: 'all set' })]))).toBe('idle')
    })
    it('assistant message, stale → idle', () => {
      expect(
        deriveStatus(input([ev({ kind: 'message', role: 'assistant', text: 'all done' })], { lastActivityAt: STALE }))
      ).toBe('idle')
    })
    it('user message, fresh → working (agent is responding)', () => {
      expect(deriveStatus(input([ev({ kind: 'message', role: 'user', text: 'do this' })]))).toBe('working')
    })
  })

  it('skips verbose-only trailing events (thinking) to find the meaningful one', () => {
    const events = [
      ev({ kind: 'question', questionId: 'q1', prompt: 'pick one' }),
      ev({ kind: 'thinking', text: '...' })
    ]
    expect(deriveStatus(input(events))).toBe('awaiting_input')
  })

  it('a trailing error notice still surfaces error', () => {
    const events = [
      ev({ kind: 'message', role: 'assistant', text: 'hmm' }),
      ev({ kind: 'notice', level: 'error', text: 'ENOENT' })
    ]
    expect(deriveStatus(input(events))).toBe('error')
  })
})
