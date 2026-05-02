import type { TestCase, TestSuite } from '../../types/testCase'

/**
 * Parse PICT's standard output (tab-separated values, header row first) into
 * a TestSuite. PICT emits one column per parameter and one row per generated
 * test case; the columns appear in the order parameters were declared.
 *
 * Empty input or a single (header-only) row yields an empty test suite. Rows
 * with fewer columns than the header are padded with empty strings; rows with
 * more columns are truncated to the header length.
 */
export function parsePictOutput(text: string): TestSuite {
  if (text.length === 0) return { factorOrder: [], rows: [] }
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter(line => line.length > 0)
  if (lines.length === 0) return { factorOrder: [], rows: [] }

  const factorOrder = lines[0]!.split('\t').map(s => s.trim())
  const rows: TestCase[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split('\t')
    const values: Record<string, string> = {}
    for (let c = 0; c < factorOrder.length; c++) {
      values[factorOrder[c]!] = (cells[c] ?? '').trim()
    }
    rows.push({ values })
  }
  return { factorOrder, rows }
}
