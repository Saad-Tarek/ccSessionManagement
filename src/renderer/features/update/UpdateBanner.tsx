import { useEffect, useState } from 'react'
import { Leaf, ArrowRight } from 'lucide-react'

/**
 * Bottom-left "Relaunch to update" banner. Appears once the main process has
 * downloaded a new release; clicking it quits and installs, then reopens.
 */
export function UpdateBanner(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    return window.api.onUpdateReady((info) => setVersion(info.version))
  }, [])

  if (!version) return null

  return (
    <button
      onClick={() => void window.api.installUpdate()}
      className="animate-slide-up fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 text-left shadow-2xl shadow-black/40 transition-colors hover:bg-surface"
    >
      <Leaf className="size-5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">Relaunch to update</span>
        <span className="block text-xs text-muted-foreground">v{version}</span>
      </span>
      <ArrowRight className="ml-2 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
