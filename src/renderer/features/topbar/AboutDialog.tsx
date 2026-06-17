import { useEffect, useState } from 'react'
import { Leaf, X } from 'lucide-react'
import type { AppInfo } from '@shared/ipc-contract'

/** Minimal About modal: app name + version, like a desktop Help → About. */
export function AboutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let alive = true
    window.api
      .appInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => undefined)
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
        className="animate-slide-up relative w-full max-w-xs rounded-xl border border-border bg-surface p-6 text-center shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <Leaf className="mx-auto size-9 text-primary" />
        <h2 className="mt-3 text-base font-semibold text-foreground">{info?.name ?? 'ccSessions'}</h2>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {info ? `v${info.version}` : 'loading…'}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          A calm control center for your Claude Code sessions.
        </p>
      </div>
    </div>
  )
}
