import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron'

// Embedded so there are no asset-path differences between dev and packaged.
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA2klEQVR4nM2XsQ3EIAxFs9PNwAyZgWHovIFXyQ7sQO8S3TVGijiICIF8it9Egf/ANpiNSTakoOY9AIZJHJMcTBKYJKqCfnP6z3AAyySeSb6N8jrmMcBHV9ZqnOvQOboAdt3eXvOkqHPdAtgHGOcqQtS2fcTKSzvxF44SwJOYt+TEJYCdaJ5krwDulFqvfA3AvGCeZEoA7kUAVwKYmXzVZDwDhBcBQglgRu3XFJcEgIcAnoTwMoQfRPCjeInLCH4dL9GQwFuyJZrSczhgbXleHZCHSS7Y02ya4AA/pQIWtk9MY8cAAAAASUVORK5CYII='

export interface TrayController {
  updateBadge(needsYou: number): void
  destroy(): void
}

export function createTray(getWindow: () => BrowserWindow | undefined): TrayController {
  const tray = new Tray(nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`))
  tray.setToolTip('ccSessions')

  const showApp = (): void => {
    const w = getWindow()
    if (w) {
      w.show()
      w.focus()
    }
  }
  tray.on('click', showApp)

  const rebuildMenu = (needsYou: number): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: needsYou > 0 ? `${needsYou} session${needsYou === 1 ? '' : 's'} need you` : 'All caught up',
          enabled: false
        },
        { type: 'separator' },
        { label: 'Show ccSessions', click: showApp },
        { label: 'Quit', click: () => app.quit() }
      ])
    )
  }
  rebuildMenu(0)

  return {
    updateBadge(needsYou: number): void {
      tray.setToolTip(needsYou > 0 ? `ccSessions — ${needsYou} need you` : 'ccSessions')
      rebuildMenu(needsYou)
    },
    destroy(): void {
      tray.destroy()
    }
  }
}
