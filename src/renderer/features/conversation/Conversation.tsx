import { useEffect, useRef } from 'react'
import { GitBranch, Eye, Sparkles, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type FeedMode } from '@/store/store'
import { isVerboseOnly, type SessionEvent } from '@shared/events'
import { READ_ONLY_CAPABILITIES } from '@shared/session'
import { StatusBadge } from '../sidebar/StatusBadge'
import { EventItem } from './EventItem'
import { Composer } from './Composer'
import { Minimap } from './Minimap'

// Stable empty reference: returning a fresh [] from a selector triggers an
// infinite re-render loop (getSnapshot must be cached).
const EMPTY_EVENTS: SessionEvent[] = []

/**
 * Summary view — the calm default. Keeps your messages, the agent's final reply
 * per turn (consecutive assistant messages collapse to the last, the "wrap-up"),
 * and anything that needs you (questions, approvals, errors). Drops the tool,
 * command, file-change and thinking firehose. Full view shows all of that.
 */
function summaryView(events: SessionEvent[]): SessionEvent[] {
  const out: SessionEvent[] = []
  let pendingAssistant = -1 // index in `out` of this turn's not-yet-final agent reply
  for (const e of events) {
    if (e.kind === 'message' && e.role === 'assistant') {
      if (pendingAssistant >= 0) out[pendingAssistant] = e
      else {
        pendingAssistant = out.length
        out.push(e)
      }
    } else if (e.kind === 'message' && e.role === 'user') {
      out.push(e)
      pendingAssistant = -1
    } else if (
      e.kind === 'question' ||
      e.kind === 'permission_request' ||
      e.kind === 'compaction' ||
      (e.kind === 'notice' && e.level !== 'info')
    ) {
      out.push(e)
      pendingAssistant = -1
    }
  }
  return out
}

function visibleEvents(events: SessionEvent[], mode: FeedMode): SessionEvent[] {
  return mode === 'summary' ? summaryView(events) : events.filter((e) => !isVerboseOnly(e))
}

export function Conversation(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const session = useStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined))
  const events = useStore((s) => (s.activeId ? s.events[s.activeId] : undefined)) ?? EMPTY_EVENTS
  const caps = useStore((s) => (s.activeId ? s.capabilities[s.activeId] : undefined)) ?? READ_ONLY_CAPABILITIES
  const feedMode = useStore((s) => s.feedMode)
  const setFeedMode = useStore((s) => s.setFeedMode)
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

  const visible = visibleEvents(events, feedMode)
  const anchors = visible
    .filter((e): e is Extract<SessionEvent, { kind: 'message' }> => e.kind === 'message' && e.role === 'user')
    .map((e) => ({ id: e.id, text: e.text }))

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
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
          <div
            className="flex items-center rounded-md border border-border p-0.5"
            role="group"
            aria-label="Conversation detail level"
          >
            <ModeButton
              label="Summary"
              active={feedMode === 'summary'}
              onClick={() => setFeedMode('summary')}
              title="Your messages and the agent's final reply per turn"
            />
            <ModeButton
              label="Full"
              active={feedMode === 'full'}
              onClick={() => setFeedMode('full')}
              title="Every tool call, command and file change"
            />
          </div>
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

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            {visible.map((e) => (
              <div id={`ev-${e.id}`} key={e.id}>
                <EventItem event={e} ctx={ctx} />
              </div>
            ))}
          </div>
        </div>
        <Minimap anchors={anchors} scrollRef={scrollRef} />
      </div>

      <Composer canReply={ctx.canReply} reason={reason} />
    </div>
  )
}

function ModeButton({
  label,
  active,
  onClick,
  title
}: {
  label: string
  active: boolean
  onClick: () => void
  title: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
