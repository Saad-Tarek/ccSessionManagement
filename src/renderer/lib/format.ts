/** Compact relative time: "now", "3m", "2h", "4d". */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

/** Last path segment, cross-platform. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Compact number: 1.2M, 340k, 87. */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k'
  return String(Math.round(n))
}

export function formatUsd(n: number): string {
  if (n <= 0) return '$0'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toFixed(2)
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** A one-line summary of a tool_use input for the activity chip. */
export function summarizeInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  const o = input as Record<string, unknown>
  const key = ['command', 'file', 'path', 'pattern', 'query', 'cmd'].find((k) => k in o)
  if (key) return String(o[key])
  try {
    return JSON.stringify(input)
  } catch {
    return ''
  }
}
