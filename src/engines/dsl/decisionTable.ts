// Decision-table (all-combination) generation — UR-009 / SR-100..105.
//
// generateDecisionTable() is the single PURE engine-layer contract that the
// GUI, CLI, and HTTP API all consume (they are thin adapters that map its
// result to their environment). It is synchronous, deterministic, and does no
// IO / DOM / HTTP.
//
// The decision table is the FULL Cartesian product of every factor's levels,
// with EVERY row kept and the forbidden ones MARKED (not excluded). Forbidden
// marking reuses the built-in evaluator that backs the forbidden view (UR-003),
// so the two never disagree. PICT is not involved.
//
// The function returns exactly one of three results and NEVER a partial table:
//   - ok            { columns, rows: [{ values, forbidden }] }
//   - too-large     { count, limit }   when the product exceeds the limit
//   - invalid-model { diagnostics }    when the model is not usable
// Because the cap is small (4096), the whole table fits in memory and is built
// atomically — there is no streaming and therefore no way to emit a partial.

import type {
  Diagnostic,
  DecisionTableResult,
  DecisionTableRow,
  LevelValue,
  Model,
  Range,
} from '../../types/dsl'
import { buildTypeInfo, isAssignmentValid } from './evaluator'

/**
 * Maximum number of combinations (the full Cartesian product) a decision table
 * may contain. The cap is on the raw product (not the valid/non-forbidden
 * count, which can't be known without enumerating); it bounds enumeration time
 * and in-browser rendering. 4096 is large enough for realistic small models
 * even when constraints forbid most rows, yet small enough to stay responsive.
 * Independent of the forbidden view's enumeration limit. See SR-103.
 */
export const DECISION_TABLE_LIMIT = 4096

const ZERO_RANGE: Range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
}

/**
 * Generate the decision table for a parsed model. See the module comment for
 * the contract. `limit` defaults to DECISION_TABLE_LIMIT; it is a parameter so
 * tests can exercise the guard with small models.
 */
export function generateDecisionTable(
  model: Model,
  options: { limit?: number } = {},
): DecisionTableResult {
  const limit = options.limit ?? DECISION_TABLE_LIMIT

  // Structural validation: the table is meaningless without at least one
  // factor, and a factor with no levels makes the product collapse to zero.
  const structural = structuralDiagnostics(model)
  if (structural.length > 0) {
    return { ok: false, reason: 'invalid-model', diagnostics: structural }
  }

  const info = buildTypeInfo(model)
  const columns = info.factors.map(f => f.name)

  // The product of every factor's level count IS the output size, because
  // forbidden rows are kept (no constraint filtering reduces it). Compute it
  // up front and refuse before enumerating anything when it exceeds the limit.
  let count = 1
  for (const f of info.factors) count *= f.levels.length
  if (count > limit) {
    return { ok: false, reason: 'too-large', count, limit }
  }

  // Enumerate the full Cartesian product in declared-factor order, evaluating
  // each row for forbidden status. A row is forbidden iff it violates any
  // constraint (a full assignment that is not valid).
  const rows: DecisionTableRow[] = []
  const levelLists = info.factors.map(f => f.levels)
  const cursor: number[] = new Array(info.factors.length).fill(0)

  for (let produced = 0; produced < count; produced++) {
    const assignment: Record<string, LevelValue> = {}
    const values: string[] = new Array(info.factors.length)
    for (let i = 0; i < info.factors.length; i++) {
      const value = levelLists[i]![cursor[i]!]!
      assignment[columns[i]!] = value
      values[i] = String(value)
    }
    rows.push({ values, forbidden: !isAssignmentValid(model, assignment, info) })
    advance(cursor, levelLists)
  }

  return { ok: true, columns, rows }
}

/**
 * Mixed-radix increment of the per-factor cursor (rightmost factor varies
 * fastest), matching declared-factor column order.
 */
function advance(cursor: number[], levelLists: LevelValue[][]): void {
  for (let i = cursor.length - 1; i >= 0; i--) {
    cursor[i]!++
    if (cursor[i]! < levelLists[i]!.length) return
    cursor[i] = 0
  }
}

function structuralDiagnostics(model: Model): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (model.parameters.length === 0) {
    diagnostics.push({
      severity: 'error',
      kind: 'syntax',
      message: 'Model declares no factors; a decision table needs at least one.',
      range: ZERO_RANGE,
    })
    return diagnostics
  }
  for (const p of model.parameters) {
    if (p.levels.length === 0) {
      diagnostics.push({
        severity: 'error',
        kind: 'syntax',
        message: `Factor "${p.name}" has no levels.`,
        range: p.nameRange,
      })
    }
  }
  return diagnostics
}
