// Shared helper that runs the full test-case-generation pipeline against
// the current store state: validates eligibility, calls the pict-service,
// parses the CSV / TSV response, and (on success) writes the suite back
// into the store.
//
// Used by both the manual "Generate" / "Re-generate" button in the Test
// cases tab and by AutoRegenerator, which fires on a debounced source
// change while the user is on any tab.

import { useProjectStore } from '../stores/projectStore'
import { generateTestCases } from './pictApi'
import { parseCsv } from './csvImport'

export type RunGenerateResult =
  | { kind: 'ok' }
  | { kind: 'skipped'; reason: 'no-source' | 'parse-errors' | 'no-parameters' }
  | { kind: 'network-error'; message: string }
  | { kind: 'pict-error'; message: string; stderr?: string }
  | { kind: 'service-error'; status: number; message: string; stderr?: string }
  | { kind: 'empty-result' }

export async function runGenerate(): Promise<RunGenerateResult> {
  const state = useProjectStore.getState()
  if (state.source.length === 0) return { kind: 'skipped', reason: 'no-source' }
  if (state.parseResult.diagnostics.some(d => d.severity === 'error')) {
    return { kind: 'skipped', reason: 'parse-errors' }
  }
  if ((state.parseResult.model?.parameters.length ?? 0) === 0) {
    return { kind: 'skipped', reason: 'no-parameters' }
  }

  const result = await generateTestCases(state.source, { order: state.pictOrder })
  if (!result.ok) {
    switch (result.error.kind) {
      case 'network':
        return { kind: 'network-error', message: result.error.message }
      case 'pict-error':
        return {
          kind: 'pict-error',
          message: result.error.message,
          ...(result.error.stderr ? { stderr: result.error.stderr } : {}),
        }
      case 'service-error':
        return {
          kind: 'service-error',
          status: result.error.status,
          message: result.error.message,
          ...(result.error.stderr ? { stderr: result.error.stderr } : {}),
        }
    }
  }

  const { suite } = parseCsv(result.value)
  if (suite.factorOrder.length === 0) return { kind: 'empty-result' }
  useProjectStore.getState().setTestSuite(suite)
  return { kind: 'ok' }
}
