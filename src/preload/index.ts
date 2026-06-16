import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type RendererApi,
  type SessionEventBatch
} from '@shared/ipc-contract'
import type { SessionSummary } from '@shared/session'

/** The full typed surface exposed on window.api. No Node APIs leak to the renderer. */
const api: RendererApi = {
  listProjects: () => ipcRenderer.invoke(IpcChannel.listProjects),
  listSessions: () => ipcRenderer.invoke(IpcChannel.listSessions),
  openSession: (req) => ipcRenderer.invoke(IpcChannel.openSession, req),
  closeSession: (sessionId) => ipcRenderer.invoke(IpcChannel.closeSession, sessionId),
  loadOlder: (req) => ipcRenderer.invoke(IpcChannel.loadOlder, req),
  capabilities: (sessionId) => ipcRenderer.invoke(IpcChannel.capabilities, sessionId),
  reply: (req) => ipcRenderer.invoke(IpcChannel.reply, req),
  answerQuestion: (req) => ipcRenderer.invoke(IpcChannel.answerQuestion, req),
  decide: (req) => ipcRenderer.invoke(IpcChannel.decide, req),
  lifecycle: (req) => ipcRenderer.invoke(IpcChannel.lifecycle, req),
  setFlag: (req) => ipcRenderer.invoke(IpcChannel.setFlag, req),
  search: (query) => ipcRenderer.invoke(IpcChannel.search, query),
  getInsights: () => ipcRenderer.invoke(IpcChannel.getInsights),
  copyText: (text) => ipcRenderer.invoke(IpcChannel.copyText, text),
  setNotifications: (enabled) => ipcRenderer.invoke(IpcChannel.setNotifications, enabled),
  onEvents: (handler) => {
    const listener = (_e: unknown, batch: SessionEventBatch): void => handler(batch)
    ipcRenderer.on(IpcChannel.onEvents, listener)
    return () => ipcRenderer.removeListener(IpcChannel.onEvents, listener)
  },
  onSummary: (handler) => {
    const listener = (_e: unknown, summary: SessionSummary): void => handler(summary)
    ipcRenderer.on(IpcChannel.onSummary, listener)
    return () => ipcRenderer.removeListener(IpcChannel.onSummary, listener)
  },
  onFocusSession: (handler) => {
    const listener = (_e: unknown, sessionId: string): void => handler(sessionId)
    ipcRenderer.on(IpcChannel.focusSession, listener)
    return () => ipcRenderer.removeListener(IpcChannel.focusSession, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type { RendererApi } from '@shared/ipc-contract'
