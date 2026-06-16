import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import type { RawEntry } from './types'

const T = '2026-06-07T05:04:15.973Z'

function assistant(content: unknown[]): RawEntry {
  return { type: 'assistant', timestamp: T, message: { role: 'assistant', content: content as never } }
}
function user(content: unknown, toolUseResult?: unknown): RawEntry {
  return { type: 'user', timestamp: T, message: { role: 'user', content: content as never }, toolUseResult }
}

describe('normalize', () => {
  it('maps assistant text / thinking / tool_use and pairs the result', () => {
    const entries: RawEntry[] = [
      assistant([
        { type: 'thinking', thinking: '…', signature: 'x' },
        { type: 'text', text: 'Reading the file.' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/a.ts' } }
      ]),
      user([{ type: 'tool_result', tool_use_id: 'tu1', content: 'file body', is_error: false }])
    ]
    const ev = normalize(entries)
    expect(ev.map((e) => e.kind)).toEqual(['thinking', 'message', 'tool_call'])
    const tool = ev.find((e) => e.kind === 'tool_call')!
    expect(tool).toMatchObject({ name: 'Read', status: 'ok', result: 'file body' })
  })

  it('specializes Bash/PowerShell into command events with error result', () => {
    const entries: RawEntry[] = [
      assistant([{ type: 'tool_use', id: 'c1', name: 'PowerShell', input: { command: 'npm test' } }]),
      user([{ type: 'tool_result', tool_use_id: 'c1', content: 'boom', is_error: true }], {
        stdout: '',
        stderr: '2 failing'
      })
    ]
    const cmd = normalize(entries).find((e) => e.kind === 'command')!
    expect(cmd).toMatchObject({ kind: 'command', cmd: 'npm test', exitCode: 1, stderr: '2 failing' })
  })

  it('maps Edit and Write to file_change with line deltas', () => {
    const entries: RawEntry[] = [
      assistant([
        { type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/x.ts', old_string: 'a\nb', new_string: 'a\nb\nc' } },
        { type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: '/y.ts', content: '1\n2\n3\n4' } }
      ])
    ]
    const ev = normalize(entries)
    expect(ev[0]).toMatchObject({ kind: 'file_change', path: '/x.ts', op: 'edit', added: 3, removed: 2 })
    expect(ev[1]).toMatchObject({ kind: 'file_change', path: '/y.ts', op: 'create', added: 4 })
  })

  it('maps AskUserQuestion to a question and attaches the chosen answer', () => {
    const entries: RawEntry[] = [
      assistant([
        {
          type: 'tool_use',
          id: 'q1',
          name: 'AskUserQuestion',
          input: {
            questions: [
              {
                question: 'Which store?',
                header: 'Store',
                options: [
                  { label: 'Redis', description: 'fast' },
                  { label: 'Postgres', description: 'no new infra' }
                ]
              }
            ]
          }
        }
      ]),
      user([{ type: 'tool_result', tool_use_id: 'q1', content: 'Postgres' }])
    ]
    const q = normalize(entries).find((e) => e.kind === 'question')!
    expect(q).toMatchObject({ kind: 'question', prompt: 'Which store?', answer: 'Postgres' })
    expect((q as { options: unknown[] }).options).toHaveLength(2)
  })

  it('maps Agent/Task to a subagent event', () => {
    const ev = normalize([
      assistant([
        { type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'design review', subagent_type: 'general-purpose', prompt: '…' } }
      ])
    ])
    expect(ev[0]).toMatchObject({ kind: 'subagent', task: 'design review', agentType: 'general-purpose' })
  })

  it('cleans slash-command wrappers in user text', () => {
    const ev = normalize([
      user('<command-message>init</command-message>\n<command-name>/init</command-name>\n<command-args>do the thing</command-args>')
    ])
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ kind: 'message', role: 'user', text: '/init do the thing' })
  })

  it('drops noise: attachments, snapshots, titles, meta, local-command output', () => {
    const ev = normalize([
      { type: 'attachment', attachment: { type: 'hook_success' } } as unknown as RawEntry,
      { type: 'file-history-snapshot' } as RawEntry,
      { type: 'ai-title', aiTitle: 'Some title' } as RawEntry,
      { type: 'system', subtype: 'stop_hook_summary' } as unknown as RawEntry,
      { type: 'user', isMeta: true, message: { role: 'user', content: 'meta' } } as RawEntry,
      user('<local-command-stdout>output</local-command-stdout>')
    ])
    expect(ev).toEqual([])
  })

  it('assigns monotonic seq and preserves order', () => {
    const ev = normalize([
      user('first'),
      assistant([{ type: 'text', text: 'second' }])
    ])
    expect(ev.map((e) => e.seq)).toEqual([0, 1])
    expect(ev.map((e) => (e.kind === 'message' ? e.text : ''))).toEqual(['first', 'second'])
  })
})
