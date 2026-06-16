/**
 * In-memory cross-session search. Lazily indexes each session's title + normalized
 * event text (via the adapter, so it is source-agnostic), caches it, and invalidates
 * per-session when the watcher reports a change. Adequate for tens-to-hundreds of
 * sessions; SQLite + FTS5 is the documented upgrade for far larger corpora.
 */

import type { SessionAdapter } from '../adapters/SessionAdapter'
import type { SessionSummary } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import type { SearchHit } from '@shared/ipc-contract'

interface Doc {
  title: string
  text: string
  lower: string
}

export class SearchIndex {
  private docs = new Map<string, Doc>()

  constructor(private readonly adapter: SessionAdapter) {}

  invalidate(id?: string): void {
    if (id) this.docs.delete(id)
    else this.docs.clear()
  }

  async query(query: string, summaries: SessionSummary[]): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    await Promise.all(
      summaries.filter((s) => !this.docs.has(s.id)).map((s) => this.indexSession(s))
    )

    const terms = q.split(/\s+/).filter(Boolean)
    const titleById = new Map(summaries.map((s) => [s.id, s.title]))
    const hits: SearchHit[] = []

    for (const [id, doc] of this.docs) {
      if (!titleById.has(id)) continue // session no longer present
      let score = 0
      let firstIdx = -1
      for (const term of terms) {
        if (doc.title.toLowerCase().includes(term)) score += 5
        const idx = doc.lower.indexOf(term)
        if (idx >= 0) {
          score += 1
          if (firstIdx < 0) firstIdx = idx
        }
      }
      if (score > 0) {
        hits.push({
          sessionId: id,
          title: titleById.get(id) ?? doc.title,
          snippet: makeSnippet(doc.text, firstIdx),
          score
        })
      }
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, 30)
  }

  private async indexSession(s: SessionSummary): Promise<void> {
    if (this.docs.has(s.id)) return
    let text = `${s.title} ${s.headline ?? ''}`
    try {
      for await (const e of this.adapter.openSession(s.id)) {
        const t = eventText(e)
        if (t) text += ' ' + t
      }
    } catch {
      // unreadable — index the title/headline only
    }
    this.docs.set(s.id, { title: s.title, text, lower: text.toLowerCase() })
  }
}

function eventText(e: SessionEvent): string {
  switch (e.kind) {
    case 'message':
      return e.text
    case 'command':
      return e.stderr ? `${e.cmd} ${e.stderr}` : e.cmd
    case 'tool_call':
      return e.name
    case 'file_change':
      return e.path
    case 'question':
      return e.answer ? `${e.prompt} ${e.answer}` : e.prompt
    case 'notice':
      return e.text
    case 'subagent':
      return e.task
    default:
      return ''
  }
}

function makeSnippet(text: string, at: number, radius = 64): string {
  if (at < 0) return collapse(text.slice(0, 130))
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + radius)
  return (start > 0 ? '…' : '') + collapse(text.slice(start, end)) + (end < text.length ? '…' : '')
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
