import { describe, it, expect } from 'vitest'
import { MockAdapter } from '../adapters/mock/MockAdapter'
import { SearchIndex } from './SearchIndex'

async function build(): Promise<{ index: SearchIndex; summaries: Awaited<ReturnType<MockAdapter['listSessions']>> }> {
  const adapter = new MockAdapter()
  const summaries = await adapter.listSessions()
  return { index: new SearchIndex(adapter), summaries }
}

describe('SearchIndex', () => {
  it('finds a session by content across the corpus', async () => {
    const { index, summaries } = await build()
    const hits = await index.query('authentication', summaries)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].title.toLowerCase()).toContain('auth')
    expect(hits[0].snippet.length).toBeGreaterThan(0)
  })

  it('matches text carried on the summary headline (rm -rf dist)', async () => {
    const { index, summaries } = await build()
    const hits = await index.query('rm -rf', summaries)
    expect(hits.some((h) => h.title.toLowerCase().includes('clean'))).toBe(true)
  })

  it('ranks title matches above body-only matches', async () => {
    const { index, summaries } = await build()
    const hits = await index.query('dashboard', summaries)
    expect(hits[0].title.toLowerCase()).toContain('dashboard')
  })

  it('ignores empty / single-char queries', async () => {
    const { index, summaries } = await build()
    expect(await index.query('', summaries)).toEqual([])
    expect(await index.query('a', summaries)).toEqual([])
  })
})
