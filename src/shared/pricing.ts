import type { TokenUsage } from './events'

/**
 * Approximate USD per million tokens, by model tier. Cache writes are billed at
 * ~1.25x input and cache reads at ~0.1x input. These are estimates for display
 * only — surface them as "~$" and don't treat them as an invoice.
 */
interface Rate {
  input: number
  output: number
}

// Approx USD per million tokens. Verify against the current Claude pricing page
// (these were last checked 2026-06). Display-only estimates, not invoices.
const RATES: Record<string, Rate> = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  fable: { input: 10, output: 50 }
}

// Cache writes bill at ~1.25x the input rate (5-min TTL), cache reads at ~0.1x.
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

const DEFAULT_RATE: Rate = { ...RATES.sonnet }

function rateFor(model?: string): Rate {
  const m = (model ?? '').toLowerCase()
  if (m.includes('opus')) return RATES.opus
  if (m.includes('haiku')) return RATES.haiku
  if (m.includes('fable')) return RATES.fable
  if (m.includes('sonnet')) return RATES.sonnet
  return DEFAULT_RATE
}

export function estimateCost(usage: TokenUsage, model?: string): number {
  const r = rateFor(model)
  const perM = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate
  return (
    perM(usage.input, r.input) +
    perM(usage.output, r.output) +
    perM(usage.cacheCreate, r.input * CACHE_WRITE_MULTIPLIER) +
    perM(usage.cacheRead, r.input * CACHE_READ_MULTIPLIER)
  )
}
