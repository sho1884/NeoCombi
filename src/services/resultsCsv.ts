// Three-column results write-back (UR-010 / SR-056).
//
// A separate import path from the factor-column CSV: the round-trip file has
// exactly three columns — id, count, note — with a header row `id,count,note`
// and the flag as true / false. Each data row is matched to an existing test
// case by ID; the case's count flag and note are updated. Rows whose ID matches
// no current case are skipped and reported (no case is created).
//
// This is how an external execution system writes results back into NeoCombi.

import { useProjectStore } from '../stores/projectStore'
import { parseRows } from './csvImport'
import type { TestSuite } from '../types/testCase'

export type ResultRow = { id: string; count: boolean; note: string }

export type ResultsParseResult = {
  rows: ResultRow[]
  /** Lines skipped while parsing (missing id, bad column count, bad flag). */
  warnings: Array<{ line: number; reason: string }>
}

/**
 * Parse the three-column results CSV. The header must contain id / count / note
 * columns (case-insensitive, any order); extra columns are ignored. A row with
 * an empty ID or an unrecognised count value is skipped and reported.
 */
export function parseResultsCsv(text: string): ResultsParseResult {
  const rows = parseRows(text, ',')
  const warnings: ResultsParseResult['warnings'] = []
  if (rows.length === 0) return { rows: [], warnings }

  const header = rows[0]!.cells.map(c => c.trim().toLowerCase())
  const idIdx = header.indexOf('id')
  const countIdx = header.indexOf('count')
  const noteIdx = header.indexOf('note')
  if (idIdx < 0 || countIdx < 0 || noteIdx < 0) {
    return {
      rows: [],
      warnings: [{ line: 1, reason: 'header must have id, count, and note columns' }],
    }
  }

  const out: ResultRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    if (r.cells.length === 1 && r.cells[0]!.trim() === '') continue
    const id = (r.cells[idIdx] ?? '').trim()
    if (id.length === 0) {
      warnings.push({ line: r.line, reason: 'empty id' })
      continue
    }
    const raw = (r.cells[countIdx] ?? '').trim().toLowerCase()
    let count: boolean
    if (raw === 'true' || raw === '1') count = true
    else if (raw === 'false' || raw === '0') count = false
    else {
      warnings.push({ line: r.line, reason: `invalid count "${raw}" (expected true/false)` })
      continue
    }
    const note = (r.cells[noteIdx] ?? '').trim()
    out.push({ id, count, note })
  }
  return { rows: out, warnings }
}

export type ResultsApplyResult = {
  matched: number
  /** IDs present in the CSV that matched no current case. */
  unmatchedIds: string[]
  warnings: ResultsParseResult['warnings']
}

/**
 * Apply a parsed results set onto the current store test suite, matching by
 * stable case ID. Returns how many cases were updated and which IDs matched
 * nothing. The destructive-action guard (SR-073) is the caller's
 * responsibility — by the time this runs, the user has agreed to overwrite.
 */
export function applyResultsCsv(text: string): ResultsApplyResult {
  const { rows, warnings } = parseResultsCsv(text)
  const state = useProjectStore.getState()
  const suite = state.testSuite
  if (!suite) {
    return { matched: 0, unmatchedIds: rows.map(r => r.id), warnings }
  }

  const byId = new Map<string, ResultRow>()
  for (const row of rows) byId.set(row.id, row)

  let matched = 0
  const matchedIds = new Set<string>()
  const nextRows = suite.rows.map(c => {
    if (c.id === undefined) return c
    const update = byId.get(c.id)
    if (!update) return c
    matched++
    matchedIds.add(c.id)
    const next = { ...c, count: update.count }
    if (update.note.length > 0) next.note = update.note
    else delete next.note
    return next
  })

  const unmatchedIds = rows.map(r => r.id).filter(id => !matchedIds.has(id))

  if (matched > 0) {
    const updated: TestSuite = { factorOrder: suite.factorOrder.slice(), rows: nextRows }
    useProjectStore.setState({ testSuite: updated, isDirty: true })
  }
  return { matched, unmatchedIds, warnings }
}
