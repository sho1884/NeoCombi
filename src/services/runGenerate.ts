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
import { aliasForPict, unaliasTsv } from './asciiAlias'

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
  const model = state.parseResult.model
  if (!model || model.parameters.length === 0) {
    return { kind: 'skipped', reason: 'no-parameters' }
  }

  // PICT's UTF-8 handling is broken for multi-byte identifiers (factor
  // names cause an infinite parse, level values come back empty). Rewrite
  // every non-ASCII identifier to an ASCII alias before the round-trip
  // and undo the rewrite on the response. ASCII-only models skip this
  // entirely (aliasForPict / unaliasTsv are no-ops in that case).
  const { source: rewrittenSource, aliasMap } = aliasForPict(state.source, model)

  const result = await generateTestCases(rewrittenSource, { order: state.pictOrder })
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

  const restored = unaliasTsv(result.value, aliasMap)
  const { suite } = parseCsv(restored)
  if (suite.factorOrder.length === 0) return { kind: 'empty-result' }
  useProjectStore.getState().setTestSuite(suite)
  return { kind: 'ok' }
}
