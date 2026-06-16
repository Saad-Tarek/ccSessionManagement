import type { SessionEvent, TokenUsage } from './events'
import { estimateCost } from './pricing'

export interface SessionStats {
  tokens: TokenUsage
  totalTokens: number
  costUsd: number
  models: string[]
  files: number
  commands: number
  tools: number
  errors: number
  testsRun: number
  testsFailed: number
  durationMs: number
  messages: number
}

export interface ProjectInsight {
  projectId: string
  name: string
  sessions: number
  total: SessionStats
  today: SessionStats
}

export interface InsightsResult {
  total: SessionStats
  today: SessionStats
  projects: ProjectInsight[]
}

const TEST_RE = /\b(test|vitest|jest|pytest|mocha|playwright|cargo test|go test)\b/i

export function emptyStats(): SessionStats {
  return {
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    totalTokens: 0,
    costUsd: 0,
    models: [],
    files: 0,
    commands: 0,
    tools: 0,
    errors: 0,
    testsRun: 0,
    testsFailed: 0,
    durationMs: 0,
    messages: 0
  }
}

export function computeStats(events: SessionEvent[]): SessionStats {
  const s = emptyStats()
  const models = new Set<string>()
  const files = new Set<string>()
  let first = Infinity
  let last = 0

  for (const e of events) {
    if (e.ts) {
      if (e.ts < first) first = e.ts
      if (e.ts > last) last = e.ts
    }
    if (e.usage) {
      s.tokens.input += e.usage.input
      s.tokens.output += e.usage.output
      s.tokens.cacheRead += e.usage.cacheRead
      s.tokens.cacheCreate += e.usage.cacheCreate
      s.costUsd += estimateCost(e.usage, e.model)
      if (e.model) models.add(e.model)
    }
    switch (e.kind) {
      case 'message':
        s.messages++
        break
      case 'file_change':
        files.add(e.path)
        break
      case 'tool_call':
        s.tools++
        if (e.status === 'error') s.errors++
        break
      case 'command':
        s.commands++
        if (TEST_RE.test(e.cmd)) {
          s.testsRun++
          if (e.exitCode != null && e.exitCode !== 0) s.testsFailed++
        } else if (e.exitCode != null && e.exitCode !== 0) {
          s.errors++
        }
        break
      case 'notice':
        if (e.level === 'error') s.errors++
        break
      default:
        break
    }
  }

  s.models = [...models]
  s.files = files.size
  s.totalTokens = s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreate
  s.durationMs = last > first ? last - first : 0
  return s
}

export function mergeStats(list: SessionStats[]): SessionStats {
  const out = emptyStats()
  const models = new Set<string>()
  for (const s of list) {
    out.tokens.input += s.tokens.input
    out.tokens.output += s.tokens.output
    out.tokens.cacheRead += s.tokens.cacheRead
    out.tokens.cacheCreate += s.tokens.cacheCreate
    out.totalTokens += s.totalTokens
    out.costUsd += s.costUsd
    out.files += s.files
    out.commands += s.commands
    out.tools += s.tools
    out.errors += s.errors
    out.testsRun += s.testsRun
    out.testsFailed += s.testsFailed
    out.messages += s.messages
    out.durationMs += s.durationMs
    s.models.forEach((m) => models.add(m))
  }
  out.models = [...models]
  return out
}
