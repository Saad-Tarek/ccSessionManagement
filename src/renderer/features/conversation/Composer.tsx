import { useState } from 'react'
import { CornerDownLeft, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'

export function Composer({ canReply, reason }: { canReply: boolean; reason: string }): JSX.Element {
  const reply = useStore((s) => s.reply)
  const [text, setText] = useState('')

  if (!canReply) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        <span>{reason}</span>
      </div>
    )
  }

  const send = (): void => {
    const t = text.trim()
    if (!t) return
    reply(t)
    setText('')
  }

  return (
    <div className="border-t border-border bg-surface p-3">
      <div className="flex items-end gap-2 rounded-lg border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
        <textarea
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Reply to the agent…"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-md transition-colors',
            text.trim()
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-surface-raised text-muted-foreground'
          )}
          aria-label="Send reply"
        >
          <CornerDownLeft className="size-4" />
        </button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">⌘↵ to send</p>
    </div>
  )
}
