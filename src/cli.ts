#!/usr/bin/env node
// NeoCombi CLI (UR-006 / SR-080..082).
//
//   neocombi generate <input.ncombi> [--format csv|tsv|json] [--output <file>]
//                                   [--pict <path>] [--order N] [--decision-table]
//
// Input is a NeoCombi model (.ncombi); a project (.ncproj) or legacy .tmodel is
// also accepted — the CLI reads the DSL and ALWAYS regenerates, ignoring any
// persisted test set (CI wants a fresh deterministic set from the model).
//
// Reads the file, validates the DSL, and emits test cases in the
// requested format. By default it spawns the external PICT executable for
// pairwise / N-wise generation. With --decision-table it instead generates the
// full-combination decision table via the built-in core (SR-104) — no PICT.
//
// Exit codes (SR-081 / SR-104):
//   0  success
//   1  DSL parse / validation error (also the core's invalid-model)
//   2  PICT invocation failed (spawn or non-zero exit) — pairwise only
//   3  input file not found / unreadable
//   4  output write failed
//   5  decision table too large (> limit) — decision-table mode only

import { readFile, writeFile } from 'node:fs/promises'
import { parse, generateDecisionTable } from './engines/dsl'
import { parsePictOutput, formatTestSuite } from './engines/pict'
import type { OutputFormat } from './engines/pict'
import { formatDecisionTable } from './engines/dsl/formatDecisionTable'
import type { DecisionTableOutRow } from './engines/dsl/formatDecisionTable'
import { runPict } from './services/pictRunner'
import { deserialize } from './services/projectFile'
import { assignCaseIds } from './services/caseIds'
import type { TestCase, TestSuite } from './types/testCase'
import type { ExpectedValueEntry } from './types/project'

type ExitCode = 0 | 1 | 2 | 3 | 4 | 5

const HELP = `\
neocombi — combinatorial test design tool (CLI)

Usage:
  neocombi generate <input.ncombi> [options]

Options:
  --format <csv|tsv|json>   Output format (default: csv)
  --output <file>           Write to file instead of stdout
  --decision-table          Generate the full-combination decision table via
                            the built-in core (no PICT); forbidden rows are
                            kept and marked in a Forbidden column
  --pict <path>             Path to the PICT executable (pairwise mode)
                            (default: $NEOCOMBI_PICT_PATH or 'pict' on PATH)
  --order <N>               Override the model's generation order (N-wise)
  -h, --help                Show this help

Exit codes:
  0  success
  1  DSL parse / validation error
  2  PICT invocation failed (pairwise mode)
  3  input file not found / unreadable
  4  output write failed
  5  decision table too large (decision-table mode)
`

async function main(argv: string[]): Promise<ExitCode> {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP)
    return 0
  }

  const [cmd, ...rest] = argv
  if (cmd !== 'generate') {
    process.stderr.write(`Unknown command: ${cmd}\nRun with --help for usage.\n`)
    return 1
  }

  const inputPath = rest[0]
  if (!inputPath || inputPath.startsWith('-')) {
    process.stderr.write('Missing input .ncombi file path.\n')
    return 3
  }

  const format = (getFlag(rest, '--format') ?? 'csv') as OutputFormat
  if (format !== 'csv' && format !== 'tsv' && format !== 'json') {
    process.stderr.write(`Unknown --format: ${format}\n`)
    return 1
  }
  const outputPath = getFlag(rest, '--output')
  const pictPath = getFlag(rest, '--pict')
  const orderArg = getFlag(rest, '--order')
  const orderOverride = orderArg !== undefined ? Number.parseInt(orderArg, 10) : undefined

  let raw: string
  try {
    raw = await readFile(inputPath, 'utf8')
  } catch (e) {
    process.stderr.write(`Cannot read ${inputPath}: ${(e as Error).message}\n`)
    return 3
  }

  const file = deserialize(raw)
  if (file.warnings.length > 0) {
    for (const w of file.warnings) {
      process.stderr.write(`warning: ${inputPath}:${w.line}: ${w.reason}\n`)
    }
  }

  const parsed = parse(file.source)
  const errors = parsed.diagnostics.filter(d => d.severity === 'error')
  if (errors.length > 0) {
    for (const err of errors) {
      process.stderr.write(
        `${inputPath}:${err.range.start.line}:${err.range.start.column} ` +
          `${err.kind}: ${err.message}\n`,
      )
    }
    return 1
  }

  // Decision-table mode (SR-104): the built-in core, no PICT. Output is atomic
  // — a complete table or nothing; a partial table is never written.
  if (rest.includes('--decision-table')) {
    if (!parsed.model) {
      process.stderr.write('No usable model.\n')
      return 1
    }
    const table = generateDecisionTable(parsed.model)
    if (!table.ok) {
      if (table.reason === 'too-large') {
        process.stderr.write(
          `Decision table too large: ${table.count} combinations exceed the ` +
            `limit of ${table.limit}. Reduce factors / level counts, or use ` +
            `pairwise instead.\n`,
        )
        return 5
      }
      for (const d of table.diagnostics) {
        process.stderr.write(`${inputPath}: ${d.kind}: ${d.message}\n`)
      }
      return 1
    }
    // Build a suite, attach notes, then assign stable D-IDs + count flags
    // (UR-010) before rendering. Forbidden rows are not test cases (no ID/flag).
    const suite: TestSuite = {
      factorOrder: table.columns.slice(),
      rows: table.rows.map(r => {
        const values: Record<string, string> = {}
        for (let i = 0; i < table.columns.length; i++) values[table.columns[i]!] = r.values[i] ?? ''
        const note = lookupExpected(table.columns, r.values, file.expectedValues)
        const row: TestCase = { values, forbidden: r.forbidden }
        if (note !== undefined) row.note = note
        return row
      }),
    }
    const withIds = assignCaseIds(suite, 'decision-table')
    const rows: DecisionTableOutRow[] = withIds.rows.map(row => {
      const out: DecisionTableOutRow = {
        values: table.columns.map(c => row.values[c] ?? ''),
        forbidden: row.forbidden ?? false,
      }
      if (row.id !== undefined) out.id = row.id
      if (row.count !== undefined) out.count = row.count
      if (row.note !== undefined) out.note = row.note
      return out
    })
    const dtOut = formatDecisionTable(table.columns, rows, format)
    return writeOutput(dtOut, outputPath)
  }

  const order = orderOverride !== undefined && Number.isFinite(orderOverride)
    ? orderOverride
    : file.pictOrder

  const result = await runPict(file.source, {
    pictPath,
    order,
  })
  if (!result.ok) {
    process.stderr.write(result.message + '\n')
    if (result.stderr.length > 0) process.stderr.write(result.stderr)
    return 2
  }

  const suite = parsePictOutput(result.stdout)
  attachExpectedValues(suite, file.expectedValues)
  const withIds = assignCaseIds(suite, 'pairwise')
  const out = formatTestSuite(withIds, format)
  return writeOutput(out, outputPath)
}

async function writeOutput(out: string, outputPath: string | undefined): Promise<ExitCode> {
  if (outputPath !== undefined) {
    try {
      await writeFile(outputPath, out, 'utf8')
    } catch (e) {
      process.stderr.write(`Cannot write ${outputPath}: ${(e as Error).message}\n`)
      return 4
    }
  } else {
    process.stdout.write(out)
  }
  return 0
}

/** Find the expected value for a decision-table row (factor values in column order). */
function lookupExpected(
  columns: string[],
  values: string[],
  entries: ExpectedValueEntry[],
): string | undefined {
  if (entries.length === 0) return undefined
  const rowValues: Record<string, string> = {}
  for (let i = 0; i < columns.length; i++) rowValues[columns[i]!] = values[i] ?? ''
  for (const entry of entries) {
    if (assignmentMatches(rowValues, entry.assignment)) return entry.value
  }
  return undefined
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx < 0) return undefined
  return args[idx + 1]
}

function attachExpectedValues(suite: TestSuite, entries: ExpectedValueEntry[]): void {
  if (entries.length === 0) return
  for (const row of suite.rows) {
    for (const entry of entries) {
      if (assignmentMatches(row.values, entry.assignment)) {
        row.note = entry.value
        break
      }
    }
  }
}

function assignmentMatches(
  rowValues: Record<string, string>,
  expectedAssignment: Record<string, string>,
): boolean {
  for (const [k, v] of Object.entries(expectedAssignment)) {
    if (rowValues[k] !== v) return false
  }
  return true
}

main(process.argv.slice(2))
  .then(code => process.exit(code))
  .catch(e => {
    process.stderr.write(`Unexpected error: ${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(2)
  })
