import { useState, useMemo } from 'react'
import { FileEdit, FilePlus2, FileX2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime, compactNumber, formatUsd, formatDuration } from '@/lib/format'
import { useStore } from '@/store/store'
import { statusView } from '@/lib/status'
import { computeStats } from '@shared/stats'
import type { SessionEvent } from '@shared/events'

// Stable empty reference — a fresh [] from a selector causes an infinite loop.
const EMPTY_EVENTS: SessionEvent[] = []

type Tab = 'details' | 'files' | 'activity' | 'stats'

export function DetailPanel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('details')
  const session = useStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined))
  const events = useStore((s) => (s.activeId ? s.events[s.activeId] : undefined)) ?? EMPTY_EVENTS

  // Hooks must run before any early return — keep them above the `!session` guard.
  const stats = useMemo(() => computeStats(events), [events])
  const files = events.filter((e): e is Extract<SessionEvent, { kind: 'file_change' }> => e.kind === 'file_change')
  const activity = events.filter((e) =>
    e.kind === 'tool_call' || e.kind === 'command' || e.kind === 'file_change' || e.kind === 'notice'
  )

  if (!session) {
    return <aside className="border-l border-border bg-surface" />
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-surface">
      <div className="flex gap-1 border-b border-border px-3 pb-2 pt-3">
        {(['details', 'files', 'activity', 'stats'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
              tab === t ? 'bg-surface-raised text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
            {t === 'files' && files.length > 0 && (
              <span className="ml-1 text-muted-foreground/60">{files.length}</span>
            )}
            {t === 'activity' && activity.length > 0 && (
              <span className="ml-1 text-muted-foreground/60">{activity.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        {tab === 'details' && (
          <dl className="space-y-3">
            <Row label="Status" value={statusView(session.status).label} />
            <Row label="Mode" value={session.source === 'transcript' ? 'Observed (read-only)' : 'Owned (interactive)'} />
            <Row label="Branch" value={session.gitBranch ?? '—'} />
            <Row label="Last activity" value={relativeTime(session.lastActivityAt)} />
            <Row label="Pending" value={session.pendingCount > 0 ? `${session.pendingCount} awaiting you` : 'None'} />
            <div>
              <dt className="text-xs text-muted-foreground">Working directory</dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground/80">{session.cwd}</dd>
            </div>
          </dl>
        )}

        {tab === 'files' && (
          <div className="space-y-1">
            {files.length === 0 && <Empty>No file changes yet.</Empty>}
            {files.map((f) => {
              const Icon = f.op === 'create' ? FilePlus2 : f.op === 'delete' ? FileX2 : FileEdit
              return (
                <div key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-raised">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs text-foreground/85">{f.path}</span>
                  <span className="ml-auto flex shrink-0 gap-1.5 text-[11px]">
                    {f.added != null && <span className="text-status-done">+{f.added}</span>}
                    {f.removed != null && <span className="text-status-error">-{f.removed}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-1">
            {activity.length === 0 && <Empty>No activity yet.</Empty>}
            {activity.map((e) => (
              <div key={e.id} className="flex items-baseline gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface-raised">
                <span className="w-10 shrink-0 text-muted-foreground/60">{relativeTime(e.ts)}</span>
                <span className="truncate text-foreground/80">{activityLabel(e)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-raised/40 p-3">
              <div className="text-2xl font-semibold text-foreground">{formatUsd(stats.costUsd)}</div>
              <div className="text-[11px] text-muted-foreground">
                estimated cost · {compactNumber(stats.totalTokens)} tokens
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Input" value={compactNumber(stats.tokens.input)} />
              <Stat label="Output" value={compactNumber(stats.tokens.output)} />
              <Stat label="Cache read" value={compactNumber(stats.tokens.cacheRead)} />
              <Stat label="Cache write" value={compactNumber(stats.tokens.cacheCreate)} />
              <Stat label="Files touched" value={String(stats.files)} />
              <Stat label="Commands" value={String(stats.commands)} />
              <Stat label="Tool calls" value={String(stats.tools)} />
              <Stat label="Messages" value={String(stats.messages)} />
              <Stat
                label="Tests"
                value={stats.testsRun > 0 ? `${stats.testsRun - stats.testsFailed}/${stats.testsRun} pass` : '—'}
                tone={stats.testsFailed > 0 ? 'error' : undefined}
              />
              <Stat label="Errors" value={String(stats.errors)} tone={stats.errors > 0 ? 'error' : undefined} />
              <Stat label="Active time" value={formatDuration(stats.durationMs)} />
              <Stat label="Model" value={stats.models[0]?.replace('claude-', '') ?? '—'} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Computed from this session&apos;s loaded window. Cost is a rough estimate.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'error' }): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-surface-raised/40 px-2.5 py-2">
      <div className={cn('text-sm font-semibold', tone === 'error' ? 'text-status-error' : 'text-foreground')}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs font-medium text-foreground/90">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: string }): JSX.Element {
  return <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>
}

function activityLabel(e: SessionEvent): string {
  switch (e.kind) {
    case 'tool_call':
      return `${e.name} · ${e.status}`
    case 'command':
      return `$ ${e.cmd}`
    case 'file_change':
      return `${e.op} ${e.path}`
    case 'notice':
      return e.text
    default:
      return e.kind
  }
}
