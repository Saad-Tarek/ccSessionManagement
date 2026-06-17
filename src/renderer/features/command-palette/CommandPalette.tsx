import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search, Hash, SunMoon, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { basename } from '@/lib/format'
import { useStore } from '@/store/store'
import { StatusDot } from '../sidebar/StatusBadge'
import type { SearchHit } from '@shared/ipc-contract'
import { nextTheme, applyTheme } from '@/lib/themes'

interface Item {
  key: string
  left: JSX.Element
  title: string
  sub?: string
  tag?: string
  activate: () => void
}

export function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.commandOpen)
  const setOpen = useStore((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sessions = useStore((s) => s.sessions)
  const select = useStore((s) => s.select)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useStore.getState().commandOpen)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHits([])
      setSel(0)
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return undefined
    }
    const t = setTimeout(async () => {
      try {
        setHits(await window.api.search(q))
      } catch {
        setHits([])
      }
    }, 160)
    return () => clearTimeout(t)
  }, [query, open])

  const sessionMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = Object.values(sessions)
    const sorted = all.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    if (!q) return sorted.slice(0, 6)
    return sorted.filter((s) => `${s.title} ${s.headline ?? ''}`.toLowerCase().includes(q)).slice(0, 6)
  }, [sessions, query])

  const items: Item[] = []
  const matched = new Set(sessionMatches.map((s) => s.id))
  for (const s of sessionMatches) {
    items.push({
      key: `s:${s.id}`,
      left: <StatusDot status={s.status} />,
      title: s.title,
      sub: s.headline,
      tag: basename(s.cwd),
      activate: () => {
        void select(s.id)
        setOpen(false)
      }
    })
  }
  for (const h of hits) {
    if (matched.has(h.sessionId)) continue
    items.push({
      key: `h:${h.sessionId}`,
      left: <Hash className="size-3.5 text-muted-foreground" />,
      title: h.title,
      sub: h.snippet,
      tag: 'match',
      activate: () => {
        void select(h.sessionId)
        setOpen(false)
      }
    })
  }
  const upcoming = nextTheme()
  items.push({
    key: 'a:theme',
    left: <SunMoon className="size-3.5 text-muted-foreground" />,
    title: `Switch theme → ${upcoming.name}`,
    activate: () => {
      applyTheme(upcoming.id)
      setOpen(false)
    }
  })

  const activeIndex = Math.min(sel, items.length - 1)

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[activeIndex]?.activate()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="animate-slide-up w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a session or search conversations…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {items.map((it, i) => (
            <button
              key={it.key}
              onMouseEnter={() => setSel(i)}
              onClick={it.activate}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                i === activeIndex ? 'bg-surface-raised' : ''
              )}
            >
              <span className="grid size-5 place-items-center">{it.left}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{it.title}</span>
                {it.sub && <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>}
              </span>
              {it.tag && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {it.tag}
                </span>
              )}
              {i === activeIndex && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
