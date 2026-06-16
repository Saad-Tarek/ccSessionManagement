import { useStore } from '@/store/store'

/** Transient bottom-center notification (e.g. "Copied N characters to clipboard"). */
export function Toast(): JSX.Element | null {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div className="animate-slide-up rounded-full border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-foreground shadow-lg shadow-black/30">
        {toast.message}
      </div>
    </div>
  )
}
