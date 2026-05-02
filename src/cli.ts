#!/usr/bin/env node
// NeoCombi CLI (UR-006 / SR-080..082).
//
//   neocombi generate <input.tmodel> [--format csv|tsv|json] [--output <file>]
//                                   [--pict <path>] [--order N]
//
// Reads the .tmodel file, validates the DSL, spawns the external PICT
// executable to generate test cases, and emits them in the requested format.
//
// Exit codes (SR-081):
//   0  success
//   1  DSL parse / validation error
//   2  PICT invocation failed (spawn or non-zero exit)
//   3  input file not found / unreadable
//   4  output write failed

import { readFile, writeFile } from 'node:fs/promises'
import { parse } from './engines/dsl'
import { parsePictOutput, formatTestSuite } from './engines/pict'
import type { OutputFormat } from './engines/pict'
import { runPict } from './services/pictRunner'
import { deserialize } from './services/tmodelFile'
import type { TestSuite } from './types/testCase'
import type { ExpectedValueEntry } from './types/project'

type ExitCode = 0 | 1 | 2 | 3 | 4

const HELP = `\
neocombi — combinatorial test design tool (CLI)

Usage:
  neocombi generate <input.tmodel> [options]

Options:
  --format <csv|tsv|json>   Output format (default: csv)
  --output <file>           Write to file instead of stdout
  --pict <path>             Path to the PICT executable
                            (default: $NEOCOMBI_PICT_PATH or 'pict' on PATH)
  --order <N>               Override the model's generation order (N-wise)
  -h, --help                Show this help

Exit codes:
  0  success
  1  DSL parse / validation error
  2  PICT invocation failed
  3  input file not found / unreadable
  4  output write failed
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
    process.stderr.write('Missing input .tmodel file path.\n')
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
  const out = formatTestSuite(suite, format)

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
        row.expected = entry.value
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
