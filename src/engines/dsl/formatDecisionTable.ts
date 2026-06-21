// Render a decision table (SR-104 / SR-105 output) as text. Shared by the CLI
// and any other consumer that needs CSV / TSV / JSON. The forbidden flag is
// preserved as its own column / field so the exported table records which rows
// are infeasible (SR-053). The CSV writer follows RFC 4180.

export type OutputFormat = 'csv' | 'json' | 'tsv'

export type DecisionTableOutRow = {
  /** Level values in the same order as `columns`. */
  values: string[]
  forbidden: boolean
  /** Stable case ID (UR-010); absent for forbidden rows (not test cases). */
  id?: string
  /** Count-toward-coverage flag (UR-010); absent for forbidden rows. */
  count?: boolean
  /** Optional free-form note attached by the user (UR-005). */
  note?: string
}

/**
 * The app-wide marker for "forbidden by a constraint": a forbidden cell / row,
 * empty for allowed. Plain ASCII on purpose — a Unicode cross glyph (U+2717
 * and friends) is font-dependent (can fail to render) and awkward in CSV / CI,
 * and in the GUI
 * the meaning is already carried by colour + aria-label, so the text is just a
 * universally-renderable redundant cue. Single source of truth shared by the
 * decision table and the forbidden matrix, across display, CSV/TSV, and the
 * HTML clipboard, so what is shown always matches what is copied / exported.
 * (JSON uses a real boolean instead; see formatJson.)
 */
export const FORBIDDEN_MARK = 'X'

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
  // Column layout (SR-053): ID, Count, <factors...>, Forbidden, Notes.
  const headers = ['ID', 'Count', ...columns, 'Forbidden', 'Notes']
  const lines: string[] = [headers.map(escape).join(sep)]
  for (const row of rows) {
    const cells = [row.id ?? '', row.count === undefined ? '' : String(row.count)]
    cells.push(...row.values)
    cells.push(row.forbidden ? FORBIDDEN_MARK : '')
    cells.push(row.note ?? '')
    lines.push(cells.map(escape).join(sep))
  }
  return lines.join('\n') + '\n'
}

function formatJson(columns: string[], rows: DecisionTableOutRow[]): string {
  const out = rows.map(row => {
    const obj: Record<string, string | boolean> = {}
    if (row.id !== undefined) obj['id'] = row.id
    if (row.count !== undefined) obj['count'] = row.count
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]!] = row.values[i] ?? ''
    }
    obj['Forbidden'] = row.forbidden
    if (row.note !== undefined) obj['note'] = row.note
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
