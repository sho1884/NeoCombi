// Generated test case types. PICT outputs a tab-separated table with one row
// per test case; the columns correspond to the model's factors in declaration
// order. Expected values (UR-005) are attached separately by stable factor /
// level identity, not stored in the PICT output itself.

export type TestCase = {
  /**
   * Map factor name -> level value (as string). Numeric levels are
   * preserved as their textual representation to avoid lossy conversion.
   */
  values: Record<string, string>
  /** Optional expected output attached by the user. */
  expected?: string
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
