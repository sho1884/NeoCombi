// RFC 4180 CSV parser for test case import. Accepts the CSV produced by
// `neocombi generate ... --format csv` and PICT's own tab-separated output
// (auto-detected from the first non-empty line).
//
// Recognised columns:
//   - Factor columns (must match parsed model factor names)
//   - Optional "Notes" (or legacy "Expected") column (case-insensitive)
//   - Optional "ID" and "Count" columns (from a NeoCombi export). ID is
//     informational (fresh IDs are reassigned on generation); Count, when a
//     valid boolean, seeds the count-toward-coverage flag.
//
// Returns a TestSuite plus warnings for unparsed / mismatched rows.

import type { TestCase, TestSuite } from '../types/testCase'

export type CsvImportResult = {
  suite: TestSuite
  /** Rows the importer skipped (empty / malformed) with the reason. */
  warnings: Array<{ line: number; reason: string }>
  /** The separator that was detected and used. */
  separator: ',' | '\t'
}

/**
 * Parse a CSV (or PICT-style TSV) string into a TestSuite. The separator is
 * detected from the first non-blank line: a line containing tabs but no
 * commas is treated as TSV; otherwise comma-separated. The first non-blank
 * row is the header, and blank lines are skipped silently.
 */
export function parseCsv(text: string): CsvImportResult {
  const separator = detectSeparator(text)
  const rows = parseRows(text, separator)
  const warnings: CsvImportResult['warnings'] = []
  if (rows.length === 0) {
    return { suite: { factorOrder: [], rows: [] }, warnings, separator }
  }

  const header = rows[0]!.cells.map(c => c.trim())
  const noteColIdx = findColumn(header, ['notes', 'note', 'expected'])
  const idColIdx = findColumn(header, ['id'])
  const countColIdx = findColumn(header, ['count'])
  const reserved = new Set([noteColIdx, idColIdx, countColIdx].filter(i => i >= 0))
  const factorOrder = header.filter((_, i) => !reserved.has(i))

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
      if (reserved.has(c)) continue
      values[header[c]!] = (r.cells[c] ?? '').trim()
    }
    const note = noteColIdx >= 0 ? (r.cells[noteColIdx] ?? '').trim() : ''
    const tc: TestCase = { values }
    if (note.length > 0) tc.note = note
    if (countColIdx >= 0) {
      const raw = (r.cells[countColIdx] ?? '').trim().toLowerCase()
      if (raw === 'true' || raw === '1') tc.count = true
      else if (raw === 'false' || raw === '0') tc.count = false
    }
    cases.push(tc)
  }

  return { suite: { factorOrder, rows: cases }, warnings, separator }
}

function findColumn(header: string[], names: string[]): number {
  return header.findIndex(h => names.includes(h.toLowerCase()))
}

function detectSeparator(text: string): ',' | '\t' {
  // Look at the first non-blank line. If it contains tabs and no commas,
  // treat the whole input as TSV (matches PICT's native output shape).
  // Otherwise fall back to CSV.
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (line.length === 0) continue
    if (line.includes('\t') && !line.includes(',')) return '\t'
    return ','
  }
  return ','
}

// =============================================================================
// RFC 4180-ish row tokenizer (parameterised by separator so it handles both
// `,`-separated CSV and `\t`-separated PICT output).
// =============================================================================

export type CsvRow = { line: number; cells: string[] }

export function parseRows(text: string, separator: ',' | '\t'): CsvRow[] {
  const rows: CsvRow[] = []
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
    if (ch === separator) {
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
