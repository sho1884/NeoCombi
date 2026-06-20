import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'

/**
 * Warn before the tab is closed, reloaded, or navigated away from while there
 * are unsaved changes, so the user doesn't lose edits. The browser shows its
 * own generic "Leave site? Changes you made may not be saved" dialog.
 *
 * In-app navigation (New / Open) is guarded separately by confirmDiscardIfDirty
 * in the File menu; this covers the browser-level exits. Renders nothing.
 */
export function UnsavedGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().isDirty) return
      // Both forms are needed across browsers to trigger the native prompt.
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return null
}
