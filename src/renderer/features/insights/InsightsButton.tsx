import { useEffect, useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { compactNumber, formatUsd, formatDuration } from '@/lib/format'
import type { InsightsResult, SessionStats } from '@shared/stats'

export function InsightsButton(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <BarChart3 className="size-4" />
        Insights
      </button>
      {open && <InsightsModal onClose={() => setOpen(false)} />}
    </>
  )
}

function InsightsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [data, setData] = useState<InsightsResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    window.api
      .getInsights()
      .then((r) => {
        if (alive) {
          setData(r)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="animate-slide-up max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="size-4 text-primary" /> Insights
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {loading && <p className="py-12 text-center text-sm text-muted-foreground">Crunching your sessions…</p>}

        {data && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Rollup title="Today" s={data.today} />
              <Rollup title="All sessions" s={data.total} />
            </div>

            <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              By project
            </p>
            <div className="space-y-0.5">
              {data.projects.map((p) => (
                <div
                  key={p.projectId}
                  className="flex items-center gap-3 rounded-md px-2.5 py-1.5 text-xs hover:bg-surface-raised"
                >
                  <span className="truncate font-medium text-foreground/90">{p.name}</span>
                  <span className="text-muted-foreground/60">{p.sessions}</span>
                  <span className="ml-auto flex shrink-0 gap-3 font-mono">
                    <span className="text-muted-foreground">{compactNumber(p.total.totalTokens)} tok</span>
                    <span className="text-status-done">{formatUsd(p.total.costUsd)}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Tokens and cost are read from each session&apos;s loaded window; cost is a rough estimate.
              {data.skipped ? ` ${data.skipped} session${data.skipped > 1 ? 's' : ''} could not be read and ${data.skipped > 1 ? 'are' : 'is'} excluded.` : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Rollup({ title, s }: { title: string; s: SessionStats }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{formatUsd(s.costUsd)}</div>
      <div className="text-[11px] text-muted-foreground">{compactNumber(s.totalTokens)} tokens</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{s.files} files</span>
        <span>{s.commands} commands</span>
        <span>{s.tools} tool calls</span>
        <span className={cn(s.testsFailed > 0 && 'text-status-error')}>
          {s.testsRun} tests{s.testsFailed > 0 ? ` (${s.testsFailed}✗)` : ''}
        </span>
        <span className={cn(s.errors > 0 && 'text-status-error')}>{s.errors} errors</span>
        <span>{formatDuration(s.durationMs)} active</span>
      </div>
    </div>
  )
}
