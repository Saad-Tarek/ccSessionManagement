import { useState } from 'react'
import {
  Brain,
  Terminal,
  FileEdit,
  FilePlus2,
  FileX2,
  Wrench,
  CircleHelp,
  ShieldAlert,
  Check,
  X,
  Loader2,
  ChevronRight,
  CornerDownRight,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime, summarizeInput } from '@/lib/format'
import { useStore } from '@/store/store'
import { Markdown } from '@/components/Markdown'
import type {
  SessionEvent,
  ToolCallEvent,
  CommandEvent,
  FileChangeEvent,
  QuestionEvent,
  PermissionRequestEvent,
  MessageEvent,
  ThinkingEvent,
  NoticeEvent,
  SubagentEvent
} from '@shared/events'

interface Ctx {
  canReply: boolean
  canApprove: boolean
  reason: string
}

export function EventItem({ event, ctx }: { event: SessionEvent; ctx: Ctx }): JSX.Element | null {
  switch (event.kind) {
    case 'message':
      return <Message e={event} />
    case 'thinking':
      return <Thinking e={event} />
    case 'tool_call':
      return <ToolChip e={event} />
    case 'command':
      return <CommandChip e={event} />
    case 'file_change':
      return <FileChange e={event} />
    case 'question':
      return <QuestionCard e={event} ctx={ctx} />
    case 'permission_request':
      return <PermissionCard e={event} ctx={ctx} />
    case 'notice':
      return <Notice e={event} />
    case 'subagent':
      return <Subagent e={event} />
    case 'state_transition':
      return null
    default:
      return null
  }
}

function Message({ e }: { e: MessageEvent }): JSX.Element {
  if (e.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary/15 px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {e.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent</span>
      <Markdown>{e.text}</Markdown>
    </div>
  )
}

function Thinking({ e }: { e: ThinkingEvent }): JSX.Element {
  const secs = e.durationMs ? Math.round(e.durationMs / 1000) : null
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
      <Brain className="size-3.5" />
      <span>{secs ? `thought for ${secs}s` : 'thought'}</span>
    </div>
  )
}

function Expandable({
  icon,
  title,
  meta,
  tone = 'default',
  children
}: {
  icon: JSX.Element
  title: JSX.Element | string
  meta?: JSX.Element
  tone?: 'default' | 'error'
  children?: JSX.Element | null
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn(
        'rounded-md border bg-surface-raised/50 text-sm',
        tone === 'error' ? 'border-status-error/30' : 'border-border'
      )}
    >
      <button
        onClick={() => children && setOpen((v) => !v)}
        className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left', !children && 'cursor-default')}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="truncate font-medium text-foreground/90">{title}</span>
        {meta}
        {children && (
          <ChevronRight
            className={cn('ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        )}
      </button>
      {open && children && (
        <div className="border-t border-border px-2.5 py-2 font-mono text-xs text-muted-foreground">{children}</div>
      )}
    </div>
  )
}

function ToolChip({ e }: { e: ToolCallEvent }): JSX.Element {
  const statusIcon =
    e.status === 'pending' ? (
      <Loader2 className="size-3.5 animate-spin text-status-running" />
    ) : e.status === 'error' ? (
      <AlertTriangle className="size-3.5 text-status-error" />
    ) : (
      <Check className="size-3.5 text-status-done" />
    )
  return (
    <Expandable
      icon={<Wrench className="size-3.5" />}
      tone={e.status === 'error' ? 'error' : 'default'}
      title={
        <span>
          {e.name}
          <span className="ml-2 font-normal text-muted-foreground">{summarizeInput(e.input)}</span>
        </span>
      }
      meta={
        <span className="ml-auto flex items-center gap-2">
          {e.durationMs != null && <span className="text-[11px] text-muted-foreground">{e.durationMs}ms</span>}
          {statusIcon}
        </span>
      }
    >
      {e.result ? <pre className="whitespace-pre-wrap">{e.result}</pre> : null}
    </Expandable>
  )
}

function CommandChip({ e }: { e: CommandEvent }): JSX.Element {
  const failed = e.exitCode != null && e.exitCode !== 0
  return (
    <Expandable
      icon={<Terminal className="size-3.5" />}
      tone={failed ? 'error' : 'default'}
      title={<span className="font-mono">{e.cmd}</span>}
      meta={
        <span className="ml-auto flex items-center gap-2">
          {e.exitCode != null && (
            <span className={cn('text-[11px]', failed ? 'text-status-error' : 'text-status-done')}>
              exit {e.exitCode}
            </span>
          )}
          {failed ? (
            <AlertTriangle className="size-3.5 text-status-error" />
          ) : (
            <Check className="size-3.5 text-status-done" />
          )}
        </span>
      }
    >
      {e.stderr || e.stdout ? <pre className="whitespace-pre-wrap">{e.stderr ?? e.stdout}</pre> : null}
    </Expandable>
  )
}

function FileChange({ e }: { e: FileChangeEvent }): JSX.Element {
  const Icon = e.op === 'create' ? FilePlus2 : e.op === 'delete' ? FileX2 : FileEdit
  const hasDiff = Boolean(e.oldText || e.newText)
  return (
    <Expandable
      icon={<Icon className="size-3.5" />}
      title={<span className="font-mono">{e.path}</span>}
      meta={
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          {e.added != null && <span className="text-status-done">+{e.added}</span>}
          {e.removed != null && <span className="text-status-error">-{e.removed}</span>}
        </span>
      }
    >
      {hasDiff ? <Diff oldText={e.oldText} newText={e.newText} /> : null}
    </Expandable>
  )
}

/** Minimal line diff: shared leading/trailing lines stay muted, the changed
 *  middle shows removals (red) then additions (green). No diff library needed. */
function Diff({ oldText = '', newText = '' }: { oldText?: string; newText?: string }): JSX.Element {
  const a = oldText.length ? oldText.split('\n') : []
  const b = newText.length ? newText.split('\n') : []
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++

  const row = (text: string, cls: string, sign: string, key: string): JSX.Element => (
    <div key={key} className={cn('whitespace-pre', cls)}>
      <span className="select-none opacity-50">{sign} </span>
      {text || ' '}
    </div>
  )

  return (
    <div className="overflow-x-auto font-mono text-[12px] leading-relaxed">
      {a.slice(0, p).map((l, i) => row(l, 'text-muted-foreground', ' ', `c${i}`))}
      {a.slice(p, a.length - s).map((l, i) => row(l, 'text-status-error', '-', `r${i}`))}
      {b.slice(p, b.length - s).map((l, i) => row(l, 'text-status-done', '+', `n${i}`))}
      {a.slice(a.length - s).map((l, i) => row(l, 'text-muted-foreground', ' ', `t${i}`))}
    </div>
  )
}

function QuestionCard({ e, ctx }: { e: QuestionEvent; ctx: Ctx }): JSX.Element {
  const answer = useStore((s) => s.answer)
  const resolved = e.answer !== undefined
  return (
    <div className="rounded-lg border border-status-waiting/25 bg-status-waiting/[0.06] p-4">
      <div className="flex items-center gap-2 text-status-waiting">
        <CircleHelp className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {resolved ? 'Answered' : 'Agent is asking'}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-medium text-foreground">{e.prompt}</p>

      {e.options && (
        <div className="mt-3 flex flex-col gap-1.5">
          {e.options.map((opt) => {
            const chosen = e.answer === opt.label
            return (
              <button
                key={opt.label}
                disabled={resolved || !ctx.canReply}
                onClick={() => answer(e.questionId, opt.label)}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  chosen
                    ? 'border-primary/50 bg-primary/15'
                    : 'border-border bg-surface hover:border-primary/40 hover:bg-surface-raised',
                  (resolved || !ctx.canReply) && !chosen && 'opacity-50'
                )}
              >
                <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium text-foreground">{opt.label}</span>
                  {opt.description && (
                    <span className="ml-1 text-muted-foreground">— {opt.description}</span>
                  )}
                </span>
                {chosen && <Check className="ml-auto size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}

      {!ctx.canReply && !resolved && <DisabledReason reason={ctx.reason} />}
    </div>
  )
}

function PermissionCard({ e, ctx }: { e: PermissionRequestEvent; ctx: Ctx }): JSX.Element {
  const decide = useStore((s) => s.decide)
  const decided = e.decision !== undefined
  return (
    <div className="rounded-lg border border-status-blocked/25 bg-status-blocked/[0.06] p-4">
      <div className="flex items-center gap-2 text-status-blocked">
        <ShieldAlert className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {decided ? `Permission ${e.decision}` : 'Approval needed'}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">
        Wants to use <span className="font-semibold">{e.tool}</span>
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs text-foreground/80">
        {summarizeInput(e.input)}
      </pre>

      {!decided && ctx.canApprove && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide(e.requestId, 'approved')}
            className="flex items-center gap-1.5 rounded-md bg-status-done/90 px-3 py-1.5 text-sm font-medium text-background hover:bg-status-done"
          >
            <Check className="size-4" /> Approve
          </button>
          <button
            onClick={() => decide(e.requestId, 'denied')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised"
          >
            <X className="size-4" /> Deny
          </button>
        </div>
      )}
      {!ctx.canApprove && !decided && <DisabledReason reason={ctx.reason} />}
    </div>
  )
}

function DisabledReason({ reason }: { reason: string }): JSX.Element {
  return <p className="mt-3 text-xs italic text-muted-foreground">{reason}</p>
}

function Notice({ e }: { e: NoticeEvent }): JSX.Element {
  const tone =
    e.level === 'error'
      ? 'text-status-error'
      : e.level === 'warn'
        ? 'text-status-waiting'
        : 'text-muted-foreground'
  return (
    <div className={cn('flex items-center gap-2 text-xs', tone)}>
      <AlertTriangle className="size-3.5" />
      <span>{e.text}</span>
    </div>
  )
}

function Subagent({ e }: { e: SubagentEvent }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
      <CornerDownRight className="size-3.5" />
      <span className="font-medium text-foreground/80">subagent</span>
      <span className="truncate">{e.task}</span>
      {e.ts ? <span className="ml-auto text-[11px]">{relativeTime(e.ts)}</span> : null}
    </div>
  )
}
