/**
 * Theme registry. Each theme is a set of CSS-variable values defined in
 * styles/tokens.css under a `[data-theme="<id>"]` selector. Switching a theme is
 * just setting `document.documentElement.dataset.theme` (+ persisting it).
 */

export interface ThemeMeta {
  id: string
  name: string
  /** Three representative colors for the picker swatch (bg, accent, secondary). */
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: 'graphite', name: 'Graphite', swatch: ['#1d1c1a', '#e08562', '#8a8580'] },
  { id: 'dark', name: 'Dark', swatch: ['#11131a', '#8b7cf0', '#3aa0ff'] },
  { id: 'light', name: 'Light', swatch: ['#f6f7f9', '#6d5ef0', '#1d7fe0'] },
  { id: 'midnight', name: 'Midnight', swatch: ['#0b1220', '#38bdf8', '#22d3ee'] },
  { id: 'dracula', name: 'Dracula', swatch: ['#282a36', '#bd93f9', '#ff79c6'] },
  { id: 'nord', name: 'Nord', swatch: ['#2e3440', '#88c0d0', '#ebcb8b'] },
  { id: 'rosepine', name: 'Rosé Pine', swatch: ['#191724', '#ebbcba', '#9ccfd8'] }
]

const STORAGE_KEY = 'theme'
const DEFAULT_THEME = 'graphite'
const VALID = new Set(THEMES.map((t) => t.id))

export function currentTheme(): string {
  const id = document.documentElement.dataset.theme
  return id && VALID.has(id) ? id : DEFAULT_THEME
}

export function applyTheme(id: string): void {
  const theme = VALID.has(id) ? id : DEFAULT_THEME
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Read the persisted theme and apply it. Call once before first paint. */
export function bootstrapTheme(): void {
  let id = DEFAULT_THEME
  try {
    id = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.theme = VALID.has(id) ? id : DEFAULT_THEME
}

export function nextTheme(): ThemeMeta {
  const i = THEMES.findIndex((t) => t.id === currentTheme())
  return THEMES[(i + 1) % THEMES.length]
}
