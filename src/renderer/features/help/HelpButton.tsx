import { useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { THEMES, currentTheme, applyTheme } from '@/lib/themes'

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: '⌘ / Ctrl + K', label: 'Command palette — jump to or search any session' },
  { keys: '⌘ / Ctrl + R', label: 'Reload the app' },
  { keys: '⌘ / Ctrl + ↵', label: 'Send a reply (interactive sessions)' },
  { keys: 'Esc', label: 'Close dialogs' }
]

const TIPS: string[] = [
  'Select text in a conversation to copy it instantly.',
  'Click a project header to collapse or expand it.',
  'Use the panel icon in the conversation header to hide the details panel.',
  'Sessions idle over 24h are grouped under “Older” at the bottom.',
  'Reply / approve are disabled for sessions running in your own terminal (read-only).'
]

function readNotif(): boolean {
  try {
    return localStorage.getItem('notifications') !== 'false'
  } catch {
    return true
  }
}

export function HelpButton(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(currentTheme())
  const [notif, setNotif] = useState(readNotif())

  const toggleNotif = (): void => {
    const value = !notif
    setNotif(value)
    try {
      localStorage.setItem('notifications', String(value))
    } catch {
      /* ignore */
    }
    void window.api.setNotifications(value)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <CircleHelp className="size-4" />
        Help &amp; shortcuts
      </button>

      {open && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-slide-up max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Help &amp; shortcuts</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{s.label}</span>
                  <kbd className="shrink-0 rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  Desktop notifications when a session needs you
                </span>
                <button
                  onClick={toggleNotif}
                  role="switch"
                  aria-checked={notif}
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                    notif ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-4 rounded-full bg-white transition-all',
                      notif ? 'left-[18px]' : 'left-0.5'
                    )}
                  />
                </button>
              </label>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Theme
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      applyTheme(t.id)
                      setTheme(t.id)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors',
                      theme === t.id
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-surface-raised'
                    )}
                  >
                    <span className="flex">
                      {t.swatch.map((c, i) => (
                        <span
                          key={i}
                          style={{ backgroundColor: c }}
                          className={cn('size-3.5 rounded-full ring-1 ring-black/30', i > 0 && '-ml-1')}
                        />
                      ))}
                    </span>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tips
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {TIPS.map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="text-primary">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
