/**
 * JSONL reading utilities tuned for large transcripts (up to ~32MB). We avoid
 * fully parsing big files: discovery reads only the head (cwd/branch) and a tail
 * window (recent entries + title + status), and openSession reads a tail window.
 */

import { promises as fs } from 'fs'
import type { RawEntry } from './types'

export interface FileMeta {
  sizeBytes: number
  mtimeMs: number
}

export async function statFile(path: string): Promise<FileMeta> {
  const s = await fs.stat(path)
  return { sizeBytes: s.size, mtimeMs: s.mtimeMs }
}

/** Tolerant line parser: skips entries that fail to parse (e.g. a partial line). */
export function parseJsonl(text: string): RawEntry[] {
  const out: RawEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed) as RawEntry)
    } catch {
      // skip malformed / partial lines
    }
  }
  return out
}

/** Parse the first `maxBytes` of the file, then keep the first `maxLines` entries. */
export async function readHead(path: string, maxLines = 6, maxBytes = 64 * 1024): Promise<RawEntry[]> {
  const handle = await fs.open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(maxBytes, size)
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, 0)
    return parseJsonl(buf.toString('utf8')).slice(0, maxLines)
  } finally {
    await handle.close()
  }
}

/**
 * Parse the last `maxBytes` of the file. The first (likely partial) line is
 * dropped when we didn't start at byte 0.
 */
export async function readTail(path: string, maxBytes = 512 * 1024): Promise<RawEntry[]> {
  const handle = await fs.open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - maxBytes)
    const length = size - start
    if (length === 0) return []
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, start)
    let text = buf.toString('utf8')
    if (start > 0) {
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    return parseJsonl(text)
  } finally {
    await handle.close()
  }
}
