import { Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/format'
import { StatusDot } from './StatusBadge'
import type { SessionSummary } from '@shared/session'

export function SessionTile({
  session,
  active,
  onSelect,
  onToggleStar,
  onDelete
}: {
  session: SessionSummary
  active: boolean
  onSelect: () => void
  onToggleStar: () => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex w-full cursor-default items-start gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors',
        active ? 'bg-surface-raised' : 'hover:bg-surface-raised/60 focus-visible:bg-surface-raised/60'
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
      <StatusDot status={session.status} className="mt-1" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm',
              session.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'
            )}
          >
            {session.title}
          </span>
          {session.pendingCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-status-waiting/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-status-waiting">
              needs you
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{session.headline ?? '—'}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5 pl-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {session.unread && <span className="size-1.5 rounded-full bg-primary" />}
          {relativeTime(session.lastActivityAt)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (
                window.confirm(
                  `Move "${session.title}" to the Recycle Bin?\n\nYou can restore it from there if needed.`
                )
              ) {
                onDelete()
              }
            }}
            className="text-muted-foreground opacity-0 transition-opacity hover:text-status-error group-hover:opacity-100"
            aria-label="Delete session"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleStar()
            }}
            className={cn(
              'opacity-0 transition-opacity group-hover:opacity-100',
              session.starred && 'opacity-100'
            )}
            aria-label={session.starred ? 'Unstar' : 'Star'}
          >
            <Star
              className={cn(
                'size-3.5',
                session.starred ? 'fill-status-waiting text-status-waiting' : 'text-muted-foreground'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
