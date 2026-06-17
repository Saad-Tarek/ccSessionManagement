/**
 * Auto-update via electron-updater, pulling published releases from GitHub.
 * Checks once on launch and downloads in the background; when an update is
 * ready it tells the renderer (which shows the "Relaunch to update" banner).
 * Installation only happens when the user clicks it — we never restart unbidden.
 *
 * No-ops in dev (no packaged app / update feed) and stays quiet on the common
 * "no release yet / offline" errors so it can't spam the conversation.
 */

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateReadyInfo } from '@shared/ipc-contract'

type NotifyReady = (info: UpdateReadyInfo) => void

let downloadedVersion: string | null = null

export function initUpdater(onReady: NotifyReady): void {
  // Only meaningful in a packaged build with a real update feed.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false // the banner click drives install, not quit

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    onReady({ version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // No published release, no network, etc. — log, don't surface to the user.
    console.error('[updater]', err instanceof Error ? err.message : err)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] check failed', err instanceof Error ? err.message : err)
  })
}

/** Quit and install the downloaded update. Safe to call only after update-downloaded. */
export function installUpdate(): void {
  if (!downloadedVersion) return
  // isSilent=false (show the installer), isForceRunAfter=true (reopen the app).
  autoUpdater.quitAndInstall(false, true)
}
