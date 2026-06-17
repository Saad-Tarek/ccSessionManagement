/**
 * Read-only adapter over the user's real transcripts in ~/.claude/projects.
 * Discovery builds summaries; openSession parses a tail window into events; a
 * debounced recursive watcher re-emits summaries as sessions change on disk.
 *
 * No interactive methods: capabilities() is read-only, so the UI disables
 * reply/approve with the "running in your terminal" reason.
 */

import { watch, type FSWatcher } from 'fs'
import { shell } from 'electron'
import type { SessionAdapter, OpenOptions } from '../SessionAdapter'
import type { SessionSummary, Capabilities } from '@shared/session'
import { READ_ONLY_CAPABILITIES } from '@shared/session'
import type { SessionEvent } from '@shared/events'
import { readTail } from './read'
import { normalize } from './normalize'
import { discoverSessions, defaultProjectsDir, type Discovered } from './discover'

const OPEN_WINDOW_BYTES = 2 * 1024 * 1024
const REFRESH_DEBOUNCE_MS = 800

export class TranscriptAdapter implements SessionAdapter {
  readonly source = 'transcript' as const

  private readonly dir: string
  private index = new Map<string, Discovered>()
  private listeners = new Set<(s: SessionSummary) => void>()
  private watcher: FSWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null

  constructor(dir: string = defaultProjectsDir()) {
    this.dir = dir
  }

  async listSessions(): Promise<SessionSummary[]> {
    const discovered = await discoverSessions(this.dir)
    this.index = new Map(discovered.map((d) => [d.summary.id, d]))
    return discovered.map((d) => d.summary)
  }

  async *openSession(id: string, opts?: OpenOptions): AsyncIterable<SessionEvent> {
    const found = this.index.get(id)
    if (!found) return
    const entries = await readTail(found.filePath, OPEN_WINDOW_BYTES)
    const events = normalize(entries)
    for (const e of events) {
      if (opts?.fromSeq !== undefined && e.seq < opts.fromSeq) continue
      yield e
    }
  }

  capabilities(): Capabilities {
    return READ_ONLY_CAPABILITIES
  }

  /** Move the transcript to the OS trash (recoverable) and drop it from the index. */
  async deleteSession(id: string): Promise<void> {
    const found = this.index.get(id)
    if (!found) return
    await shell.trashItem(found.filePath)
    this.index.delete(id)
  }

  subscribe(onChange: (s: SessionSummary) => void): () => void {
    this.listeners.add(onChange)
    this.startWatch()
    return () => {
      this.listeners.delete(onChange)
      if (this.listeners.size === 0) this.stopWatch()
    }
  }

  // ── watching ────────────────────────────────────────────────────────────

  private startWatch(): void {
    if (this.watcher) return
    try {
      const w = watch(this.dir, { recursive: true }, () => this.scheduleRefresh())
      w.on('error', () => {
        // Watchers are frequently invalidated by sleep/wake; tear down and retry.
        this.stopWatch()
        setTimeout(() => {
          if (this.listeners.size > 0) this.startWatch()
        }, 1000)
      })
      this.watcher = w
    } catch {
      // Recursive watch unsupported here; summaries still load on listSessions.
      this.watcher = null
    }
  }

  /** Re-establish the (often sleep-killed) watcher and rescan. */
  onResume(): void {
    this.stopWatch()
    if (this.listeners.size > 0) this.startWatch()
    void this.refresh()
  }

  private stopWatch(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
  }

  private scheduleRefresh(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS)
  }

  private async refresh(): Promise<void> {
    const discovered = await discoverSessions(this.dir)
    // A transient read failure (e.g. right after wake) yields []; never wipe a
    // previously-populated index because of it.
    if (discovered.length === 0 && this.index.size > 0) return
    const next = new Map(discovered.map((d) => [d.summary.id, d]))
    for (const [id, d] of next) {
      const prev = this.index.get(id)?.summary
      if (
        !prev ||
        prev.lastActivityAt !== d.summary.lastActivityAt ||
        prev.status !== d.summary.status ||
        prev.headline !== d.summary.headline
      ) {
        this.listeners.forEach((fn) => fn(d.summary))
      }
    }
    this.index = next
  }
}
