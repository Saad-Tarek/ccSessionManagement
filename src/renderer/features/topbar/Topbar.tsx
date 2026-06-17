import { useState } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Menu as MenuIcon, PanelLeft, Search, Check, ChevronRight, Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'
import { THEMES, applyTheme, currentTheme } from '@/lib/themes'
import { AboutDialog } from './AboutDialog'

const REPO_URL = 'https://github.com/Saad-Tarek/ccSessionManagement'

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-surface-raised'
const labelClass = 'px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'
const contentClass =
  'z-50 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-2xl shadow-black/40'

/** Slim window toolbar: app menu, sidebar collapse, and global search. */
export function Topbar(): JSX.Element {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const setCommandOpen = useStore((s) => s.setCommandOpen)
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <header
      className={cn(
        'drag flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface pl-2 pr-0',
        window.api.isMac && 'pl-[78px]'
      )}
    >
      <AppMenu onAbout={() => setAboutOpen(true)} />

      <ToolbarButton title="Hide / show the session list" onClick={toggleSidebar}>
        <PanelLeft className="size-4" />
      </ToolbarButton>

      <ToolbarButton title="Search sessions (⌘/Ctrl+K)" onClick={() => setCommandOpen(true)}>
        <Search className="size-4" />
      </ToolbarButton>

      <span className="ml-1 text-xs font-medium text-muted-foreground">ccSessions</span>

      <div className="flex-1" />

      {!window.api.isMac && <WindowControls />}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </header>
  )
}

function WindowControls(): JSX.Element {
  return (
    <div className="no-drag flex items-center">
      <WindowButton title="Minimize" onClick={() => void window.api.minimizeWindow()}>
        <Minus className="size-4" />
      </WindowButton>
      <WindowButton title="Maximize" onClick={() => void window.api.maximizeWindow()}>
        <Square className="size-3" />
      </WindowButton>
      <WindowButton title="Close" danger onClick={() => void window.api.closeWindow()}>
        <X className="size-4" />
      </WindowButton>
    </div>
  )
}

function WindowButton({
  title,
  onClick,
  danger,
  children
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'grid h-10 w-11 place-items-center text-muted-foreground transition-colors',
        danger ? 'hover:bg-status-error hover:text-white' : 'hover:bg-surface-raised hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ToolbarButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      {children}
    </button>
  )
}

function AppMenu({ onAbout }: { onAbout: () => void }): JSX.Element {
  const s = useStore.getState
  const setFeedMode = useStore((st) => st.setFeedMode)
  const toggleSidebar = useStore((st) => st.toggleSidebar)
  const toggleDetail = useStore((st) => st.toggleDetail)
  const setNewSessionOpen = useStore((st) => st.setNewSessionOpen)
  const setCommandOpen = useStore((st) => st.setCommandOpen)
  const setHelpOpen = useStore((st) => st.setHelpOpen)

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          title="Menu"
          className="no-drag grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-raised hover:text-foreground data-[state=open]:bg-surface-raised data-[state=open]:text-foreground"
        >
          <MenuIcon className="size-4" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={6} className={contentClass}>
          <Menu.Label className={labelClass}>File</Menu.Label>
          <Menu.Item className={itemClass} onSelect={() => setNewSessionOpen(true)}>
            New session
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => void window.api.quit()}>
            Quit
          </Menu.Item>

          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Label className={labelClass}>Edit</Menu.Label>
          <Menu.Item className={itemClass} onSelect={() => setCommandOpen(true)}>
            Find…
          </Menu.Item>

          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Label className={labelClass}>View</Menu.Label>
          <Menu.Item className={itemClass} onSelect={toggleSidebar}>
            Toggle session list
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={toggleDetail}>
            Toggle details panel
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => setFeedMode('summary')}>
            <Check className={cn('size-3.5', s().feedMode === 'summary' ? 'opacity-100' : 'opacity-0')} />
            Summary view
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => setFeedMode('full')}>
            <Check className={cn('size-3.5', s().feedMode === 'full' ? 'opacity-100' : 'opacity-0')} />
            Full view
          </Menu.Item>
          <ThemeSubmenu />

          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Label className={labelClass}>Help</Menu.Label>
          <Menu.Item className={itemClass} onSelect={() => setHelpOpen(true)}>
            Keyboard shortcuts
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => window.open(REPO_URL, '_blank')}>
            View on GitHub
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={onAbout}>
            About ccSessions
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function ThemeSubmenu(): JSX.Element {
  const active = currentTheme()
  return (
    <Menu.Sub>
      <Menu.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-surface-raised')}>
        Theme
        <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent sideOffset={4} className={contentClass}>
          {THEMES.map((t) => (
            <Menu.Item key={t.id} className={itemClass} onSelect={() => applyTheme(t.id)}>
              <Check className={cn('size-3.5', active === t.id ? 'opacity-100' : 'opacity-0')} />
              {t.name}
            </Menu.Item>
          ))}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  )
}
