import { useMemo, useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusView } from '@/lib/status'
import { useStore } from '@/store/store'
import { SessionTile } from './SessionTile'
import { HelpButton } from '../help/HelpButton'
import { InsightsButton } from '../insights/InsightsButton'
import type { SessionSummary, StatusBadge } from '@shared/session'

const STATUS_FILTERS: Array<{ key: StatusBadge | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'error', label: 'Error' },
  { key: 'done', label: 'Done' }
]

// A session is "active" if it had activity within this window; older ones are
// archived (hidden by default). Tunable — matches the observed gap between open
// sessions and the long tail of historical transcripts.
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

export function Sidebar(): JSX.Element {
  const projects = useStore((s) => s.projects)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const filter = useStore((s) => s.filter)
  const select = useStore((s) => s.select)
  const toggleStar = useStore((s) => s.toggleStar)
  const setQuery = useStore((s) => s.setQuery)
  const setStatusFilter = useStore((s) => s.setStatusFilter)

  const [showArchived, setShowArchived] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleProject = (id: string): void => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  const all = useMemo(() => Object.values(sessions), [sessions])
  const needsYou = all.reduce((n, s) => n + (s.pendingCount > 0 ? 1 : 0), 0)

  const matches = (s: SessionSummary): boolean => {
    const q = filter.query.trim().toLowerCase()
    if (q && !`${s.title} ${s.headline ?? ''}`.toLowerCase().includes(q)) return false
    if (filter.status !== 'all' && statusView(s.status).badge !== filter.status) return false
    return true
  }

  const now = Date.now()
  const isActive = (s: SessionSummary): boolean => now - s.lastActivityAt < ACTIVE_WINDOW_MS
  const byRecency = (a: SessionSummary, b: SessionSummary): number => b.lastActivityAt - a.lastActivityAt
  const searching = filter.query.trim() !== ''

  const filtered = all.filter(matches)
  // When searching, show all matches; otherwise split active (running/idle) from the
  // older archive so running/idle stay up top and everything else collapses away.
  const activePool = searching ? filtered : filtered.filter(isActive)
  const archived = searching ? [] : filtered.filter((s) => !isActive(s)).sort(byRecency)

  const renderTile = (s: SessionSummary): JSX.Element => (
    <SessionTile
      key={s.id}
      session={s}
      active={s.id === activeId}
      onSelect={() => select(s.id)}
      onToggleStar={() => toggleStar(s.id)}
    />
  )

  const groups = projects
    .map((p) => ({
      project: p,
      items: activePool.filter((s) => s.projectId === p.id).sort(byRecency)
    }))
    .filter((g) => g.items.length > 0)

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-surface">
      <div className="drag h-9 shrink-0" />

      <div className="no-drag flex items-center gap-2 px-4 pb-2">
        <div className="grid size-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
          cc
        </div>
        <span className="text-sm font-semibold">Sessions</span>
        {needsYou > 0 && (
          <span className="ml-auto rounded-full bg-status-waiting/15 px-2 py-0.5 text-[11px] font-semibold text-status-waiting">
            {needsYou} need you
          </span>
        )}
      </div>

      <div className="no-drag px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter.query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                filter.status === f.key
                  ? 'border-primary/40 bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-surface-raised'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.project.id] === true
          return (
            <div key={g.project.id} className="mt-1.5">
              <button
                onClick={() => toggleProject(g.project.id)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-surface-raised/60"
              >
                <ChevronRight
                  className={cn(
                    'size-3 shrink-0 text-muted-foreground transition-transform',
                    !isCollapsed && 'rotate-90'
                  )}
                />
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.project.name}
                </span>
                <span className="text-[11px] text-muted-foreground/60">{g.items.length}</span>
              </button>
              {!isCollapsed && <div className="space-y-0.5">{g.items.map(renderTile)}</div>}
            </div>
          )
        })}

        {archived.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-surface-raised/60"
            >
              <ChevronRight
                className={cn(
                  'size-3 shrink-0 text-muted-foreground transition-transform',
                  showArchived && 'rotate-90'
                )}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Older
              </span>
              <span className="text-[11px] text-muted-foreground/60">{archived.length}</span>
            </button>
            {showArchived && <div className="space-y-0.5">{archived.map(renderTile)}</div>}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground">
            {all.length === 0
              ? 'No Claude Code sessions found yet. Start one in a terminal and it will appear here.'
              : 'No sessions match your search or filter.'}
          </p>
        )}
      </div>

      <div className="no-drag border-t border-border p-2">
        <InsightsButton />
        <HelpButton />
      </div>
    </aside>
  )
}
