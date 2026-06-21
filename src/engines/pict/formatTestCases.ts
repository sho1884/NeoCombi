import type { TestCase, TestSuite } from '../../types/testCase'
import { escapeHtml } from '../../services/clipboardWrite'

export type OutputFormat = 'csv' | 'json' | 'tsv'

/**
 * Render a test suite as text in the requested format. The CSV writer
 * follows RFC 4180: fields containing comma, double-quote, or newline are
 * wrapped in double quotes and embedded quotes are doubled. The TSV writer
 * passes values verbatim because PICT itself uses tabs.
 */
export function formatTestSuite(suite: TestSuite, format: OutputFormat): string {
  switch (format) {
    case 'csv': return formatCsv(suite)
    case 'tsv': return formatTsv(suite)
    case 'json': return formatJson(suite)
  }
}

// Column layout (SR-053): ID, Count, <factors...>, Notes. The ID and count
// flag carry the stable identity and coverage gating (UR-010); the notes column
// is the free-form memo (UR-005). Count is emitted as true / false.
function formatCsv(suite: TestSuite): string {
  const headers = ['ID', 'Count', ...suite.factorOrder, 'Notes']
  const lines: string[] = [headers.map(escapeCsvCell).join(',')]
  for (const row of suite.rows) {
    const cells = [row.id ?? '', countCell(row)]
    cells.push(...suite.factorOrder.map(name => row.values[name] ?? ''))
    cells.push(row.note ?? '')
    lines.push(cells.map(escapeCsvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

function formatTsv(suite: TestSuite): string {
  const headers = ['ID', 'Count', ...suite.factorOrder, 'Notes']
  const lines: string[] = [headers.join('\t')]
  for (const row of suite.rows) {
    const cells = [row.id ?? '', countCell(row)]
    cells.push(...suite.factorOrder.map(name => row.values[name] ?? ''))
    cells.push(row.note ?? '')
    lines.push(cells.join('\t'))
  }
  return lines.join('\n') + '\n'
}

function formatJson(suite: TestSuite): string {
  // Stable shape: an array of objects with an `id`, a `count` flag, the factor
  // names as keys, and an optional `note` field.
  const out = suite.rows.map((row: TestCase) => {
    const obj: Record<string, string | boolean> = {}
    if (row.id !== undefined) obj['id'] = row.id
    if (row.count !== undefined) obj['count'] = row.count
    for (const name of suite.factorOrder) {
      obj[name] = row.values[name] ?? ''
    }
    if (row.note !== undefined) obj['note'] = row.note
    return obj
  })
  return JSON.stringify(out, null, 2) + '\n'
}

/** Count flag as a text cell: true / false, empty for non-cases (no flag). */
function countCell(row: TestCase): string {
  return row.count === undefined ? '' : String(row.count)
}

function escapeCsvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Render a test suite as a minimal HTML <table> for clipboard / rich-text
 * paste targets. Excel and Google Sheets recognise this and lay it out as a
 * proper grid; pasting into a plain editor falls back to the text/plain
 * representation that callers ship alongside.
 */
export function testSuiteToHtml(suite: TestSuite): string {
  const headers = ['ID', 'Count', ...suite.factorOrder, 'Notes']
  const headerHtml = headers
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join('')
  const rowsHtml = suite.rows
    .map((row: TestCase) => {
      const cells = [row.id ?? '', countCell(row)]
      cells.push(...suite.factorOrder.map(name => row.values[name] ?? ''))
      cells.push(row.note ?? '')
      return (
        '<tr>' +
        cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') +
        '</tr>'
      )
    })
    .join('')
  return (
    '<table>' +
    `<thead><tr>${headerHtml}</tr></thead>` +
    `<tbody>${rowsHtml}</tbody>` +
    '</table>'
  )
}
