// Detect when the persisted test set (UR-011) no longer matches the current
// model. The set is keyed by factor name and stores level values, so a DSL
// change that removes / renames a factor or level through raw text editing —
// anything the structured rename actions can't carry across (see
// renameFactorInSuite / renameLevelInSuite) — can leave the set referencing
// things the model no longer has.
//
// Rather than silently mutate the saved rows (which would discard the recorded
// flags / notes, against UR-011/SR-073) or silently show a misleading coverage
// matrix, we DETECT the mismatch so the UI can surface it. Regeneration stays
// the explicit, guarded way to refresh.

import type { Model } from '../types/dsl'
import type { TestSuite } from '../types/testCase'

export type StaleInfo = {
  /** True when the set references a factor or level the model no longer has. */
  stale: boolean
  /** Suite factors that are absent from the model (renamed away or removed). */
  missingFactors: string[]
  /** True when some row carries a value not among the model's declared levels. */
  hasInvalidValues: boolean
}

const OK: StaleInfo = { stale: false, missingFactors: [], hasInvalidValues: false }

/**
 * Compare a persisted suite against the model. Returns which suite factors are
 * absent from the model and whether any row value falls outside the model's
 * declared levels. A null suite or model is never stale (nothing to reconcile).
 */
export function inspectTestSuite(
  suite: TestSuite | null,
  model: Model | null,
): StaleInfo {
  if (!suite || !model || suite.rows.length === 0) return OK

  const levelsByFactor = new Map<string, Set<string>>()
  for (const p of model.parameters) {
    levelsByFactor.set(p.name, new Set(p.levels.map(l => String(l.value))))
  }

  const missingFactors = suite.factorOrder.filter(f => !levelsByFactor.has(f))

  let hasInvalidValues = false
  outer: for (const row of suite.rows) {
    for (const f of suite.factorOrder) {
      const levels = levelsByFactor.get(f)
      if (!levels) continue // already counted as a missing factor
      const v = row.values[f]
      if (v !== undefined && v !== '' && !levels.has(v)) {
        hasInvalidValues = true
        break outer
      }
    }
  }

  return {
    stale: missingFactors.length > 0 || hasInvalidValues,
    missingFactors,
    hasInvalidValues,
  }
}
