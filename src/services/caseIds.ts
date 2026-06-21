// Stable case-ID and count-flag assignment (UR-010 / SR-054 / SR-055).
//
// Pure function shared by the GUI store, the run* services, and the CLI. It
// assigns each TEST CASE (non-forbidden row) a stable, human-readable ID:
//   - pairwise / N-wise: "P" + a zero-padded sequence number
//   - decision-table:    "D" + a zero-padded sequence number
// The sequence is padded to the digit width of the table's case count, so the
// IDs sort lexicographically (11 cases -> P01..P11; 1944 cases -> D0001..D1944).
//
// Forbidden decision-table rows are NOT test cases: they receive no ID and no
// count flag. Real cases default to counted (count = true) unless a value is
// already present (preserved, e.g. when re-deriving a restored set).

import type { TestCase, TestSuite } from '../types/testCase'
import type { GenerationMode } from '../types/project'

export function idPrefix(mode: GenerationMode): 'P' | 'D' {
  return mode === 'decision-table' ? 'D' : 'P'
}

/**
 * Does the suite carry any recorded count flag (off) or note? Used by the
 * destructive-action guard (SR-073): a discarding action only prompts when
 * there is something worth losing.
 */
export function suiteHasAnnotations(suite: TestSuite | null): boolean {
  if (!suite) return false
  return suite.rows.some(r => r.count === false || (r.note !== undefined && r.note.length > 0))
}

/**
 * Return a copy of `suite` with stable IDs and default count flags assigned.
 * Existing notes and (when present) count flags are preserved; IDs are always
 * (re)assigned from scratch, since this runs only at generation time.
 */
export function assignCaseIds(suite: TestSuite, mode: GenerationMode): TestSuite {
  const prefix = idPrefix(mode)
  const caseCount = suite.rows.reduce((n, r) => (r.forbidden ? n : n + 1), 0)
  const width = Math.max(1, String(caseCount).length)

  let seq = 0
  const rows = suite.rows.map(row => {
    if (row.forbidden) {
      // Forbidden rows are not test cases: strip any ID / flag, keep the note.
      const stripped: TestCase = { values: row.values, forbidden: true }
      if (row.note !== undefined) stripped.note = row.note
      return stripped
    }
    seq++
    const id = prefix + String(seq).padStart(width, '0')
    return { ...row, id, count: row.count ?? true }
  })
  return { factorOrder: suite.factorOrder.slice(), rows }
}
