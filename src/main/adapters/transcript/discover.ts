/**
 * Discover sessions from ~/.claude/projects without fully parsing large files.
 * For each top-level <sessionId>.jsonl we read the head (cwd/branch), a tail
 * window (recent entries + ai-title + status), and the file mtime.
 */

import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { SessionSummary, SessionStatus } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import { isPending } from '@shared/events'
import { deriveStatus } from '../../status/deriveStatus'
import { readHead, readTail, statFile } from './read'
import { normalize } from './normalize'
import type { RawEntry } from './types'

export function defaultProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

export interface Discovered {
  summary: SessionSummary
  filePath: string
}

export async function discoverSessions(dir: string): Promise<Discovered[]> {
  let projectDirs: string[]
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return [] // projects dir missing — handled as empty state upstream
  }

  const results: Discovered[] = []
  for (const pd of projectDirs) {
    const projectPath = join(dir, pd)
    let files: string[]
    try {
      files = (await fs.readdir(projectPath)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const file of files) {
      try {
        const d = await discoverOne(join(projectPath, file))
        if (d) results.push(d)
      } catch {
        // skip unreadable/locked file
      }
    }
  }
  return results.sort((a, b) => b.summary.lastActivityAt - a.summary.lastActivityAt)
}

async function discoverOne(filePath: string): Promise<Discovered | null> {
  const meta = await statFile(filePath)
  if (meta.sizeBytes === 0) return null

  const head = await readHead(filePath, 8)
  const tail = await readTail(filePath, 256 * 1024)
  const sessionId = basename(filePath).replace(/\.jsonl$/, '')

  const cwd = findLast(head.concat(tail), (e) => !!e.cwd)?.cwd ?? basename(filePath)
  const gitBranch = findLast(tail, (e) => !!e.gitBranch)?.gitBranch
  const tailEvents = normalize(tail)

  const title =
    findLast(tail, (e) => e.type === 'ai-title' && !!e.aiTitle)?.aiTitle ??
    firstUserText(normalize(head)) ??
    basename(cwd)

  const status: SessionStatus = deriveStatus({
    recentEvents: tailEvents.slice(-16),
    lastActivityAt: meta.mtimeMs,
    now: Date.now()
  })

  return {
    filePath,
    summary: {
      id: sessionId,
      projectId: cwd,
      title: truncate(title, 80),
      cwd,
      gitBranch,
      status,
      source: 'transcript',
      lastActivityAt: meta.mtimeMs,
      headline: headlineFor(tailEvents),
      unread: false,
      starred: false,
      pendingCount: tailEvents.filter(isPending).length
    }
  }
}

function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i]
  return undefined
}

function firstUserText(events: SessionEvent[]): string | undefined {
  const m = events.find((e) => e.kind === 'message' && e.role === 'user')
  return m && m.kind === 'message' ? m.text : undefined
}

function headlineFor(events: SessionEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    switch (e.kind) {
      case 'question':
        if (e.answer === undefined) return `asked: ${truncate(e.prompt, 64)}`
        break
      case 'command':
        return `ran: ${truncate(e.cmd, 64)}`
      case 'file_change':
        return `${e.op === 'create' ? 'created' : 'edited'} ${basename(e.path)}`
      case 'tool_call':
        return e.status === 'pending' ? `${e.name}…` : `${e.name}`
      case 'message':
        if (e.role === 'assistant') return truncate(e.text, 72)
        break
      default:
        break
    }
  }
  return undefined
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean
}

// Re-exported for tests / adapter.
export type { RawEntry }
