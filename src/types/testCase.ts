// Generated test case types. PICT outputs a tab-separated table with one row
// per test case; the columns correspond to the model's factors in declaration
// order. Notes (UR-005) are attached per row as free text; stable IDs and the
// count-toward-coverage flag (UR-010) are assigned at generation time and
// persisted with the set (UR-011).

export type TestCase = {
  /**
   * Map factor name -> level value (as string). Numeric levels are
   * preserved as their textual representation to avoid lossy conversion.
   */
  values: Record<string, string>
  /**
   * Stable, human-readable ID (UR-010 / SR-054). Pairwise cases are "P" + a
   * zero-padded sequence (P01..P11); decision-table cases are "D" + a
   * zero-padded sequence (D0001..D1944). Assigned at generation, persisted,
   * and reassigned only on explicit regeneration. Forbidden decision-table
   * rows are not test cases and carry no ID (undefined).
   */
  id?: string
  /**
   * "Count toward coverage" flag (UR-010 / SR-055). Binary, default = counted
   * (true). Only flagged-in cases contribute to the coverage matrix / rate
   * (SR-044). Forbidden decision-table rows are not test cases and carry no
   * flag (undefined).
   */
  count?: boolean
  /**
   * Free-form note attached by the user (UR-005). Originally framed as an
   * "expected value"; in practice a design-time memo (expected result,
   * remark, reference, or rationale). Column label "Notes / メモ・備考".
   */
  note?: string
  /**
   * Decision-table mode only (UR-009 / SR-102): true when this combination is
   * forbidden by the model's constraints. Undefined for pairwise rows (PICT
   * never emits forbidden rows).
   */
  forbidden?: boolean
}

export type TestSuite = {
  /** Ordered list of factor (column) names. */
  factorOrder: string[]
  rows: TestCase[]
}
