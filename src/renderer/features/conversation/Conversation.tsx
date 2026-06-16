import { useEffect, useRef } from 'react'
import { GitBranch, Eye, Sparkles, Brain, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'
import { isVerboseOnly, type SessionEvent } from '@shared/events'
import { READ_ONLY_CAPABILITIES } from '@shared/session'
import { StatusBadge } from '../sidebar/StatusBadge'
import { EventItem } from './EventItem'
import { Composer } from './Composer'

// Stable empty reference: returning a fresh [] from a selector triggers an
// infinite re-render loop (getSnapshot must be cached).
const EMPTY_EVENTS: SessionEvent[] = []

export function Conversation(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const session = useStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined))
  const events = useStore((s) => (s.activeId ? s.events[s.activeId] : undefined)) ?? EMPTY_EVENTS
  const caps = useStore((s) => (s.activeId ? s.capabilities[s.activeId] : undefined)) ?? READ_ONLY_CAPABILITIES
  const verbose = useStore((s) => s.verbose)
  const toggleVerbose = useStore((s) => s.toggleVerbose)
  const detailCollapsed = useStore((s) => s.detailCollapsed)
  const toggleDetail = useStore((s) => s.toggleDetail)

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevActive = useRef<string | null>(activeId)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sessionChanged = prevActive.current !== activeId
    prevActive.current = activeId
    // On a new session, jump to the latest. On live growth, only follow if the
    // user is already near the bottom (don't yank them away while reading history).
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (sessionChanged || nearBottom) el.scrollTop = el.scrollHeight
  }, [events.length, activeId])

  if (!session) {
    return (
      <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">
        Select a session to view the conversation.
      </div>
    )
  }

  const observed = session.source === 'transcript'
  const reason = observed
    ? 'Running in your terminal — reply there. Observed sessions are read-only.'
    : 'This session is read-only.'
  const ctx = { canReply: caps.canReply, canApprove: caps.canApprove, reason }

  // Virtualization lands with the transcript adapter (Phase 2) for long threads.
  const visible = events.filter((e) => verbose || !isVerboseOnly(e))

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="drag flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="no-drag min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-sm font-semibold">{session.title}</h2>
            <StatusBadge status={session.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            {session.gitBranch && (
              <span className="flex items-center gap-1">
                <GitBranch className="size-3" />
                {session.gitBranch}
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1',
                observed ? 'text-muted-foreground' : 'text-primary'
              )}
            >
              {observed ? <Eye className="size-3" /> : <Sparkles className="size-3" />}
              {observed ? 'Observed · read-only' : 'Owned · interactive'}
            </span>
          </div>
        </div>
        <div className="no-drag flex items-center gap-1.5">
          <button
            onClick={toggleVerbose}
            title={verbose ? 'Hide thinking & verbose events' : 'Show thinking & verbose events'}
            className={cn(
              'grid size-7 place-items-center rounded-md border transition-colors',
              verbose
                ? 'border-primary/40 bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:bg-surface-raised'
            )}
          >
            <Brain className="size-4" />
          </button>
          <button
            onClick={toggleDetail}
            title={detailCollapsed ? 'Show details panel' : 'Hide details panel'}
            className={cn(
              'grid size-7 place-items-center rounded-md border transition-colors',
              !detailCollapsed
                ? 'border-primary/40 bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:bg-surface-raised'
            )}
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
          {visible.map((e) => (
            <EventItem key={e.id} event={e} ctx={ctx} />
          ))}
        </div>
      </div>

      <Composer canReply={ctx.canReply} reason={reason} />
    </div>
  )
}
