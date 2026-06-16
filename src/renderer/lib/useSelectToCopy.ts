import { useEffect } from 'react'
import { useStore } from '@/store/store'

async function copyText(text: string): Promise<boolean> {
  try {
    if (window.api?.copyText) {
      await window.api.copyText(text)
      return true
    }
  } catch {
    /* fall through to the browser clipboard */
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Terminal-style select-to-copy: finishing a mouse selection copies it to the
 * clipboard and toasts how much. Selections inside editable fields (search box,
 * reply composer) are left alone so you can still edit there.
 */
export function useSelectToCopy(): void {
  const showToast = useStore((s) => s.showToast)

  useEffect(() => {
    const onMouseUp = (): void => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return
      const text = selection.toString()
      if (!text.trim()) return

      const node = selection.anchorNode
      const el = node instanceof Element ? node : node?.parentElement
      if (el?.closest('input, textarea, [contenteditable="true"]')) return

      void copyText(text).then((ok) => {
        if (ok) showToast(`Copied ${text.length} chars to clipboard`)
      })
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [showToast])
}
