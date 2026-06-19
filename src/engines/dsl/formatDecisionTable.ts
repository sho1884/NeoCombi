// Render a decision table (SR-104 / SR-105 output) as text. Shared by the CLI
// and any other consumer that needs CSV / TSV / JSON. The forbidden flag is
// preserved as its own column / field so the exported table records which rows
// are infeasible (SR-053). The CSV writer follows RFC 4180.

export type OutputFormat = 'csv' | 'json' | 'tsv'

export type DecisionTableOutRow = {
  /** Level values in the same order as `columns`. */
  values: string[]
  forbidden: boolean
  /** Optional expected result attached by the user (UR-005). */
  expected?: string
}

/** CSV / TSV cell marking a forbidden row; empty for an allowed row. */
const FORBIDDEN_MARK = 'x'

export function formatDecisionTable(
  columns: string[],
  rows: DecisionTableOutRow[],
  format: OutputFormat,
): string {
  switch (format) {
    case 'csv': return formatDelimited(columns, rows, ',', escapeCsvCell)
    case 'tsv': return formatDelimited(columns, rows, '\t', cell => cell)
    case 'json': return formatJson(columns, rows)
  }
}

function formatDelimited(
  columns: string[],
  rows: DecisionTableOutRow[],
  sep: string,
  escape: (s: string) => string,
): string {
  const headers = [...columns, 'Forbidden', 'Expected']
  const lines: string[] = [headers.map(escape).join(sep)]
  for (const row of rows) {
    const cells = [...row.values]
    cells.push(row.forbidden ? FORBIDDEN_MARK : '')
    cells.push(row.expected ?? '')
    lines.push(cells.map(escape).join(sep))
  }
  return lines.join('\n') + '\n'
}

function formatJson(columns: string[], rows: DecisionTableOutRow[]): string {
  const out = rows.map(row => {
    const obj: Record<string, string | boolean> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]!] = row.values[i] ?? ''
    }
    obj['Forbidden'] = row.forbidden
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
