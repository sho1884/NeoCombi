import { useEffect, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { runGenerate } from '../services/runGenerate'

const DEBOUNCE_MS = 900

/**
 * Tab-independent auto-regeneration. Mounted once near the app root so it
 * keeps watching the DSL source / order even when the user is editing
 * factors in the Factors & Levels tab (where the Test cases tab is
 * unmounted). Renders nothing.
 */
export function AutoRegenerator() {
  const source = useProjectStore(s => s.source)
  const pictOrder = useProjectStore(s => s.pictOrder)
  const hasErrors = useProjectStore(s =>
    s.parseResult.diagnostics.some(d => d.severity === 'error'),
  )
  const paramCount = useProjectStore(
    s => s.parseResult.model?.parameters.length ?? 0,
  )
  const lastFiredFor = useRef<string | null>(null)

  useEffect(() => {
    if (hasErrors) return
    if (source.length === 0) return
    if (paramCount === 0) return
    if (lastFiredFor.current === source) return

    const handle = window.setTimeout(async () => {
      const result = await runGenerate()
      if (result.kind === 'ok') {
        lastFiredFor.current = source
      }
      // Errors here are silently ignored — the manual Re-generate path
      // exists for cases where the user wants explicit feedback.
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [source, pictOrder, hasErrors, paramCount])

  return null
}
