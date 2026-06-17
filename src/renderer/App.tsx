import { useEffect } from 'react'
import { cn } from './lib/utils'
import { useStore } from './store/store'
import { Sidebar } from './features/sidebar/Sidebar'
import { Conversation } from './features/conversation/Conversation'
import { DetailPanel } from './features/detail/DetailPanel'
import { CommandPalette } from './features/command-palette/CommandPalette'
import { Toast } from './features/toast/Toast'
import { UpdateBanner } from './features/update/UpdateBanner'
import { useSelectToCopy } from './lib/useSelectToCopy'

export default function App(): JSX.Element {
  const ready = useStore((s) => s.ready)
  const initError = useStore((s) => s.initError)
  const detailCollapsed = useStore((s) => s.detailCollapsed)
  const init = useStore((s) => s.init)
  const refreshSessions = useStore((s) => s.refreshSessions)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshSessions()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshSessions])

  useSelectToCopy()

  if (initError) {
    return (
      <div className="h-full overflow-auto whitespace-pre-wrap bg-background p-6 font-mono text-sm text-status-error">
        <strong>Failed to start</strong>
        {'\n\n'}
        {initError}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">
        Loading sessions…
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          'grid h-full overflow-hidden bg-background',
          detailCollapsed ? 'grid-cols-[300px_minmax(0,1fr)]' : 'grid-cols-[300px_minmax(0,1fr)_340px]'
        )}
      >
        <Sidebar />
        <Conversation />
        {!detailCollapsed && <DetailPanel />}
      </div>
      <CommandPalette />
      <Toast />
      <UpdateBanner />
    </>
  )
}
