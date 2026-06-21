import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import {
  clearActiveHandle,
  hasActiveHandle,
  openProjectFile,
  saveProjectFile,
} from '../services/fileBridge'
import { isModelFileName } from '../services/projectFile'
import './FileMenu.css'

export function FileMenu() {
  const isDirty = useProjectStore(s => s.isDirty)
  const filePath = useProjectStore(s => s.filePath)
  const hasTestSuite = useProjectStore(s => s.testSuite !== null)
  const loadProjectFile = useProjectStore(s => s.loadProjectFile)
  const toProjectFile = useProjectStore(s => s.toProjectFile)
  const toModelFile = useProjectStore(s => s.toModelFile)
  const markSaved = useProjectStore(s => s.markSaved)
  const resetToEmpty = useProjectStore(s => s.resetToEmpty)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmDiscardIfDirty = (action: string): boolean => {
    if (!isDirty) return true
    return window.confirm(
      `You have unsaved changes. ${action} anyway? Unsaved changes will be lost.`,
    )
  }

  const onNew = () => {
    if (!confirmDiscardIfDirty('Start a new project')) return
    clearActiveHandle()
    resetToEmpty()
    setError(null)
  }

  const onOpen = async () => {
    if (!confirmDiscardIfDirty('Open another file')) return
    setBusy(true)
    setError(null)
    try {
      const result = await openProjectFile()
      if (!result) return
      loadProjectFile(result.content, result.name)
    } catch (e) {
      setError(formatError('open', e))
    } finally {
      setBusy(false)
    }
  }

  const doSave = async (saveAs: boolean) => {
    setBusy(true)
    setError(null)
    try {
      // Content follows the target extension: a .ncombi name writes a DSL-only
      // model; anything else (.ncproj, legacy .tmodel) writes the full project
      // including the persisted test set.
      const content = (name: string) =>
        isModelFileName(name) ? toModelFile() : toProjectFile()
      // Default name when there is no path yet: a project once a test set
      // exists (so flags / notes are kept), otherwise a bare model.
      const suggested = filePath ?? (hasTestSuite ? 'project.ncproj' : 'model.ncombi')
      const result = await saveProjectFile(content, { saveAs, suggestedName: suggested })
      if (!result) return
      markSaved(result.name)
    } catch (e) {
      setError(formatError('save', e))
    } finally {
      setBusy(false)
    }
  }

  const onSave = () => doSave(false)
  const onSaveAs = () => doSave(true)

  return (
    <div className="file-menu" role="toolbar" aria-label="File operations">
      <button type="button" onClick={onNew} disabled={busy}>New</button>
      <button type="button" onClick={onOpen} disabled={busy}>Open…</button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || (!hasActiveHandle() && !filePath)}
        title={
          hasActiveHandle() || filePath
            ? 'Save to current file'
            : "No active file — use Save As"
        }
      >
        Save
      </button>
      <button type="button" onClick={onSaveAs} disabled={busy}>Save As…</button>
      {error ? <span className="file-menu__error" role="alert">{error}</span> : null}
    </div>
  )
}

function formatError(verb: 'open' | 'save', e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return `Failed to ${verb} file: ${msg}`
}
