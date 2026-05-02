// RFC 4180 CSV parser for test case import. Accepts the CSV produced by
// `neocombi generate ... --format csv` and any compatible input.
//
// Recognised columns:
//   - Factor columns (must match parsed model factor names)
//   - Optional "Expected" column (case-insensitive match)
//
// Returns a TestSuite plus warnings for unparsed / mismatched rows.

import type { TestCase, TestSuite } from '../types/testCase'

export type CsvImportResult = {
  suite: TestSuite
  /** Rows the importer skipped (empty / malformed) with the reason. */
  warnings: Array<{ line: number; reason: string }>
}

/**
 * Parse a CSV string into a TestSuite. The first non-empty row is treated as
 * the header. Empty lines are skipped silently.
 */
export function parseCsv(text: string): CsvImportResult {
  const rows = parseRows(text)
  const warnings: CsvImportResult['warnings'] = []
  if (rows.length === 0) {
    return { suite: { factorOrder: [], rows: [] }, warnings }
  }

  const header = rows[0]!.cells.map(c => c.trim())
  const expectedColIdx = findExpectedColumn(header)
  const factorOrder =
    expectedColIdx >= 0
      ? header.filter((_, i) => i !== expectedColIdx)
      : header.slice()

  const cases: TestCase[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    if (r.cells.length === 0 || (r.cells.length === 1 && r.cells[0] === '')) {
      // skip blank lines silently
      continue
    }
    if (r.cells.length < header.length) {
      // pad short rows for forgiving parse
      while (r.cells.length < header.length) r.cells.push('')
    }
    const values: Record<string, string> = {}
    for (let c = 0; c < header.length; c++) {
      if (c === expectedColIdx) continue
      values[header[c]!] = (r.cells[c] ?? '').trim()
    }
    const expected = expectedColIdx >= 0 ? (r.cells[expectedColIdx] ?? '').trim() : ''
    const tc: TestCase = { values }
    if (expected.length > 0) tc.expected = expected
    cases.push(tc)
  }

  return { suite: { factorOrder, rows: cases }, warnings }
}

function findExpectedColumn(header: string[]): number {
  return header.findIndex(h => h.toLowerCase() === 'expected')
}

// =============================================================================
// RFC 4180 row tokenizer
// =============================================================================

type Row = { line: number; cells: string[] }

function parseRows(text: string): Row[] {
  const rows: Row[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1

  const pushCell = () => {
    cells.push(cell)
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (cells.length === 1 && cells[0] === '') {
      // blank line
    } else {
      rows.push({ line, cells })
    }
    cells = []
    line++
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      pushCell()
      continue
    }
    if (ch === '\r') {
      // Treat \r\n as one newline
      if (text[i + 1] === '\n') i++
      pushRow()
      continue
    }
    if (ch === '\n') {
      pushRow()
      continue
    }
    cell += ch
  }
  // Trailing cell / row at end of input (if non-empty).
  if (cell.length > 0 || cells.length > 0) {
    pushRow()
  }
  return rows
}
