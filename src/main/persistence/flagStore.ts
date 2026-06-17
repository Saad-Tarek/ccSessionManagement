/**
 * Tiny persistent store for per-session user flags (unread / starred / pinned / notes).
 * A single JSON file in the app's userData dir — no native dependency. SQLite + FTS5
 * remains the documented upgrade path if session counts ever reach the thousands.
 */

import { promises as fs, mkdirSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { FlagKind } from '@shared/ipc-contract'

export interface Flags {
  unread?: boolean
  starred?: boolean
  pinned?: boolean
  notes?: string
}

export class FlagStore {
  private readonly path: string
  private data: Record<string, Flags> = {}
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(userDataDir: string) {
    this.path = join(userDataDir, 'flags.json')
  }

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await fs.readFile(this.path, 'utf8')) as Record<string, Flags>
    } catch {
      this.data = {} // first run / unreadable — start empty
    }
  }

  get(id: string): Flags {
    return this.data[id] ?? {}
  }

  set(id: string, flag: FlagKind, value: boolean): void {
    const next: Flags = { ...this.get(id), [flag]: value }
    if (value === false) delete next[flag] // keep the file lean
    const data = { ...this.data, [id]: next }
    if (Object.keys(next).length === 0) delete data[id]
    this.data = data
    this.scheduleSave()
  }

  /**
   * Flush any pending write synchronously. Call on app quit (`will-quit`) so a
   * debounced edit isn't lost — the process may exit before an async write resolves.
   */
  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const tmp = `${this.path}.tmp`
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
      renameSync(tmp, this.path)
    } catch (err) {
      console.error('[flags] failed to persist on close', err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), 400)
  }

  private async flush(): Promise<void> {
    const tmp = `${this.path}.tmp`
    try {
      await fs.mkdir(dirname(this.path), { recursive: true })
      // Write to a temp file then rename — atomic on the same volume, so a crash
      // mid-write can never truncate the real flags.json and wipe every flag.
      await fs.writeFile(tmp, JSON.stringify(this.data), 'utf8')
      await fs.rename(tmp, this.path)
    } catch (err) {
      console.error('[flags] failed to persist', err)
    }
  }
}
