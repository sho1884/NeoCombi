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

function formatCsv(suite: TestSuite): string {
  const headers = [...suite.factorOrder, 'Expected']
  const lines: string[] = [headers.map(escapeCsvCell).join(',')]
  for (const row of suite.rows) {
    const cells = suite.factorOrder.map(name => row.values[name] ?? '')
    cells.push(row.expected ?? '')
    lines.push(cells.map(escapeCsvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

function formatTsv(suite: TestSuite): string {
  const headers = [...suite.factorOrder, 'Expected']
  const lines: string[] = [headers.join('\t')]
  for (const row of suite.rows) {
    const cells = suite.factorOrder.map(name => row.values[name] ?? '')
    cells.push(row.expected ?? '')
    lines.push(cells.join('\t'))
  }
  return lines.join('\n') + '\n'
}

function formatJson(suite: TestSuite): string {
  // Stable shape: an array of objects with factor names as keys + an optional
  // `expected` field. Easier for downstream tools to consume than nested.
  const out = suite.rows.map((row: TestCase) => {
    const obj: Record<string, string> = {}
    for (const name of suite.factorOrder) {
      obj[name] = row.values[name] ?? ''
    }
    if (row.expected !== undefined) obj['Expected'] = row.expected
    return obj
  })
  return JSON.stringify(out, null, 2) + '\n'
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
  const headers = [...suite.factorOrder, 'Expected']
  const headerHtml = headers
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join('')
  const rowsHtml = suite.rows
    .map((row: TestCase) => {
      const cells = suite.factorOrder.map(name => row.values[name] ?? '')
      cells.push(row.expected ?? '')
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
