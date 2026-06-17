import { join } from 'path'
import { statSync } from 'fs'
import { app, shell, BrowserWindow, powerMonitor, clipboard, ipcMain, globalShortcut, dialog } from 'electron'
import { IpcChannel, type CreateSessionRequest } from '@shared/ipc-contract'
import { MockAdapter } from './adapters/mock/MockAdapter'
import { TranscriptAdapter } from './adapters/transcript/TranscriptAdapter'
import type { SessionAdapter } from './adapters/SessionAdapter'
import { CompositeAdapter } from './adapters/CompositeAdapter'
import { SessionService } from './services/SessionService'
import { FlagStore } from './persistence/flagStore'
import { NotificationManager } from './notifications'
import { createTray, type TrayController } from './tray'
import { initUpdater, installUpdate } from './updater'

// Real transcripts by default; CC_ADAPTER=mock forces the deterministic mock.
const base: SessionAdapter =
  process.env['CC_ADAPTER'] === 'mock' ? new MockAdapter() : new TranscriptAdapter()
const adapter = new CompositeAdapter(base)

let service: SessionService | null = null
let tray: TrayController | null = null
let flags: FlagStore | null = null
let isQuitting = false

function getWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

// Spawning an owned session runs a process in `cwd` — never trust the renderer
// payload. Validate at the boundary and reject before reaching the Agent SDK.
const ALLOWED_MODELS = new Set(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])

function validateCreateSession(req: CreateSessionRequest): { cwd: string; prompt: string; model?: string } {
  if (!req || typeof req.cwd !== 'string' || typeof req.prompt !== 'string') {
    throw new Error('Invalid session request')
  }
  const prompt = req.prompt.trim()
  if (!prompt) throw new Error('Prompt is required')
  if (req.model !== undefined && (typeof req.model !== 'string' || !ALLOWED_MODELS.has(req.model))) {
    throw new Error(`Unknown model: ${String(req.model)}`)
  }
  try {
    if (!statSync(req.cwd).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`Working directory is not accessible: ${req.cwd}`)
  }
  return { cwd: req.cwd, prompt, model: req.model }
}

function send(channel: string, payload: unknown): void {
  getWindow()?.webContents.send(channel, payload)
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#11131a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  // Closing the window hides it to the tray so the background monitor keeps
  // running and notifying. A real quit happens via the tray menu / Cmd+Q.
  window.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      window.hide()
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev diagnostics: pipe the renderer console + load failures into the main log.
  window.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`)
  })
  window.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    window.loadURL(devUrl)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function toggleWindow(): void {
  const w = getWindow()
  if (!w) {
    createWindow()
    return
  }
  if (w.isVisible() && w.isFocused()) {
    w.hide()
  } else {
    w.show()
    w.focus()
  }
}

app.whenReady().then(async () => {
  flags = new FlagStore(app.getPath('userData'))
  await flags.load()

  const notifications = new NotificationManager(getWindow, send, IpcChannel.focusSession)
  tray = createTray(getWindow)

  service = new SessionService(adapter, send, flags, { notifications, tray })
  service.register()

  ipcMain.handle(IpcChannel.copyText, (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle(IpcChannel.setNotifications, (_e, enabled: boolean) => notifications.setEnabled(enabled))
  ipcMain.handle(IpcChannel.installUpdate, () => installUpdate())
  ipcMain.handle(IpcChannel.createSession, (_e, req: CreateSessionRequest) => {
    const { cwd, prompt, model } = validateCreateSession(req)
    return adapter.createOwned(cwd, prompt, model)
  })
  ipcMain.handle(IpcChannel.pickDirectory, async () => {
    const w = getWindow()
    const result = w
      ? await dialog.showOpenDialog(w, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // Global hotkey to summon / hide the window from anywhere.
  globalShortcut.register('CommandOrControl+Shift+C', toggleWindow)

  // Check for updates and tell the renderer once one is downloaded.
  initUpdater((info) => send(IpcChannel.updateReady, info))

  createWindow()

  app.on('activate', () => {
    const w = getWindow()
    if (!w) createWindow()
    else w.show()
  })

  // After sleep, file watchers go stale. Re-establish them and re-push summaries.
  powerMonitor.on('resume', () => {
    adapter.onResume?.()
    void service?.refreshAll()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

// Tray-resident: closing the window does not quit; the app stays in the tray.
app.on('window-all-closed', () => {
  /* keep running in the tray */
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  service?.dispose()
  flags?.close()
  tray?.destroy()
})
