// GUI adapter for decision-table generation (SR-100/101). Unlike pairwise
// (runGenerate -> pict-service over HTTP), the decision table is produced by
// the built-in pure-TS core IN THE BROWSER — no PICT, no network. It maps the
// core's three-variant result onto the store's test suite or an error.

import { useProjectStore } from '../stores/projectStore'
import { generateDecisionTable, DECISION_TABLE_LIMIT } from '../engines/dsl'
import type { TestCase, TestSuite } from '../types/testCase'

export type RunDecisionTableResult =
  | { kind: 'ok' }
  | { kind: 'skipped'; reason: 'no-source' | 'parse-errors' | 'no-parameters' }
  | { kind: 'too-large'; count: number; limit: number }
  | { kind: 'invalid-model'; message: string }

export function runDecisionTable(): RunDecisionTableResult {
  const state = useProjectStore.getState()
  if (state.source.length === 0) return { kind: 'skipped', reason: 'no-source' }
  if (state.parseResult.diagnostics.some(d => d.severity === 'error')) {
    return { kind: 'skipped', reason: 'parse-errors' }
  }
  const model = state.parseResult.model
  if (!model || model.parameters.length === 0) {
    return { kind: 'skipped', reason: 'no-parameters' }
  }

  const result = generateDecisionTable(model)
  if (!result.ok) {
    if (result.reason === 'too-large') {
      return { kind: 'too-large', count: result.count, limit: result.limit }
    }
    return {
      kind: 'invalid-model',
      message: result.diagnostics.map(d => d.message).join('; '),
    }
  }

  const rows: TestCase[] = result.rows.map(r => {
    const values: Record<string, string> = {}
    for (let i = 0; i < result.columns.length; i++) {
      values[result.columns[i]!] = r.values[i] ?? ''
    }
    return { values, forbidden: r.forbidden }
  })
  const suite: TestSuite = { factorOrder: result.columns.slice(), rows }
  // setTestSuite preserves the forbidden flag (spread) and attaches any
  // matching expected values the user already maintained.
  useProjectStore.getState().setTestSuite(suite)
  return { kind: 'ok' }
}

export { DECISION_TABLE_LIMIT }
