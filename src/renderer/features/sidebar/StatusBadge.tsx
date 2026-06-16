import { cn } from '@/lib/utils'
import { statusView } from '@/lib/status'
import type { SessionStatus } from '@shared/session'

export function StatusDot({
  status,
  className
}: {
  status: SessionStatus
  className?: string
}): JSX.Element {
  const v = statusView(status)
  return (
    <span className={cn('relative inline-flex size-2.5 shrink-0', className)}>
      {v.pulse && (
        <span
          className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-50', v.dot)}
        />
      )}
      <span className={cn('relative inline-flex size-2.5 rounded-full', v.dot)} />
    </span>
  )
}

export function StatusBadge({ status }: { status: SessionStatus }): JSX.Element {
  const v = statusView(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs font-medium',
        v.text
      )}
    >
      <span className={cn('size-1.5 rounded-full', v.dot)} />
      {v.label}
    </span>
  )
}
