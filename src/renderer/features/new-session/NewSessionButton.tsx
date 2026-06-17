import { useState } from 'react'
import { Plus, Folder, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { basename } from '@/lib/format'
import { useStore } from '@/store/store'

const MODELS: Array<{ id: string; name: string }> = [
  { id: '', name: 'Default' },
  { id: 'claude-opus-4-8', name: 'Opus 4.8' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' }
]

export function NewSessionButton(): JSX.Element {
  const setOpen = useStore((s) => s.setNewSessionOpen)
  return (
    <button
      onClick={() => setOpen(true)}
      title="New session"
      className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      <Plus className="size-4" />
    </button>
  )
}

/** The launch dialog, rendered once at app level and toggled via store.newSessionOpen. */
export function NewSessionDialog(): JSX.Element | null {
  const open = useStore((s) => s.newSessionOpen)
  const onClose = (): void => useStore.getState().setNewSessionOpen(false)
  const createSession = useStore((s) => s.createSession)
  const [cwd, setCwd] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (): Promise<void> => {
    const p = await window.api.pickDirectory()
    if (p) setCwd(p)
  }

  const launch = async (): Promise<void> => {
    if (!cwd || !prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createSession(cwd, prompt.trim(), model || undefined)
      onClose()
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Failed to launch session')
    }
  }

  if (!open) return null

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="animate-slide-up w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> New session
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Project folder
            </label>
            <button
              onClick={pick}
              className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-surface-raised"
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              {cwd ? (
                <span className="truncate">
                  <span className="text-foreground">{basename(cwd)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{cwd}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Choose a folder…</span>
              )}
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              First message
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="What should the agent do?"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {error && <p className="text-xs text-status-error">{error}</p>}

          <button
            onClick={launch}
            disabled={!cwd || !prompt.trim() || busy}
            className={cn(
              'w-full rounded-md py-2 text-sm font-medium transition-colors',
              !cwd || !prompt.trim() || busy
                ? 'cursor-not-allowed bg-surface-raised text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            {busy ? 'Launching…' : 'Launch session'}
          </button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Runs a real Claude Code agent in that folder, owned by this app — so reply and Approve/Deny work here. Uses
            your existing Claude Code login.
          </p>
        </div>
      </div>
    </div>
  )
}
