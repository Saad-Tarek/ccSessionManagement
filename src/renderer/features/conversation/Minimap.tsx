import { useEffect, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'

export interface Anchor {
  id: string
  text: string
}

/**
 * A right-edge conversation navigator (ChatGPT-style): one mark per user turn.
 * Click a mark to jump to that question; the mark nearest the top highlights as
 * you scroll. Anchors resolve to `#ev-<id>` nodes the feed renders.
 */
export function Minimap({
  anchors,
  scrollRef
}: {
  anchors: Anchor[]
  scrollRef: RefObject<HTMLDivElement>
}): JSX.Element | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || anchors.length < 2) return undefined
    const onScroll = (): void => {
      const top = el.getBoundingClientRect().top
      let current = anchors[0].id
      for (const a of anchors) {
        const node = document.getElementById(`ev-${a.id}`)
        if (node && node.getBoundingClientRect().top - top <= 96) current = a.id
      }
      setActive(current)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [anchors, scrollRef])

  if (anchors.length < 2) return null

  const jump = (id: string): void => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(`ev-${id}`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="pointer-events-none absolute right-1.5 top-1/2 z-10 flex max-h-[70%] -translate-y-1/2 flex-col items-end gap-1.5 overflow-hidden py-1">
      {anchors.map((a) => (
        <button
          key={a.id}
          onClick={() => jump(a.id)}
          title={a.text}
          aria-label="Jump to message"
          className="group pointer-events-auto flex h-3 items-center justify-end"
        >
          <span
            className={cn(
              'h-0.5 rounded-full transition-all duration-200',
              active === a.id
                ? 'w-5 bg-primary'
                : 'w-2.5 bg-muted-foreground/35 group-hover:w-4 group-hover:bg-muted-foreground'
            )}
          />
        </button>
      ))}
    </div>
  )
}
