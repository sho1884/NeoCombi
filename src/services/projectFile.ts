// NeoCombi file (de)serialization.
//
// Two extensions share ONE on-disk grammar (plain PICT DSL subset + NeoCombi
// annotations as PICT-compatible comments). They differ only in WHAT is written:
//
//   .ncombi  — DSL model only: factors / levels / constraints + generation
//              settings + expected-value rules. No persisted test set. The
//              shareable, version-controllable, CI-facing model (ADR-014).
//   .ncproj  — project: everything in .ncombi PLUS the persisted test set
//              (rows, IDs, count flags, notes) so a session restores without
//              regenerating (UR-011).
//   .tmodel  — legacy (pre-rename). Still opened; saved back as a project.
//
// `serialize` includes the test set whenever `input.testSuite` is non-null, so
// the caller (the store, by target extension) decides model vs project by
// passing testSuite or null. `deserialize` is tolerant: it reads whatever is
// present, so all three extensions parse through the same path.
//
// Annotations:
//
//   # @neocombi:order N                  PICT generation order N (default 2 omitted)
//   # @neocombi:mode decision-table      Generation mode (default 'pairwise' omitted)
//   # @neocombi:expected K=V K=V | text  Expected value for the test case identified
//                                        by the given factor=level pairs. The pipe
//                                        separates the assignment from the free-text
//                                        expected output. Pipes inside the value are
//                                        escaped as `\|` and de-escaped on load.
//   # @neocombi:caseset-factors A B C    Column order of the persisted test set.
//   # @neocombi:case id=P01 count=1 K=V K=V | note
//                                        One persisted test case (UR-011 / SR-072):
//                                        reserved keys id / count / forbidden, then
//                                        factor=level pairs, then the free-text note.
//                                        Forbidden decision-table rows use
//                                        `forbidden=1` and carry no id / count.
//
// On load, annotations are extracted into structured fields and stripped from the
// returned `source`. On save, the source is emitted verbatim and a fresh annotations
// block is appended after a header comment line.

import type { ExpectedValueEntry, GenerationMode } from '../types/project'
import type { TestCase, TestSuite } from '../types/testCase'

const ANNOTATION_PREFIX = '# @neocombi:'
const ANNOTATIONS_HEADER_PATTERN = /^# =+ NeoCombi annotations.*=+/
const DEFAULT_PICT_ORDER = 2
const DEFAULT_GENERATION_MODE: GenerationMode = 'pairwise'

export type TmodelFileContents = {
  source: string
  expectedValues: ExpectedValueEntry[]
  pictOrder: number
  generationMode: GenerationMode
  /**
   * Persisted test set (UR-011). null / omitted when the file has no saved
   * cases — the GUI then starts with an empty set and the user generates one.
   */
  testSuite?: TestSuite | null
}

export type TmodelLoadWarning = {
  line: number
  text: string
  reason: string
}

export type TmodelLoadResult = TmodelFileContents & {
  warnings: TmodelLoadWarning[]
}

/** Native NeoCombi file extensions. */
export const MODEL_EXTENSION = '.ncombi'
export const PROJECT_EXTENSION = '.ncproj'
export const LEGACY_EXTENSION = '.tmodel'

/**
 * Whether a file name denotes a DSL-only MODEL (.ncombi) rather than a full
 * project. Used to decide whether to write the persisted test set: model files
 * never carry it; projects (.ncproj) and legacy (.tmodel) files do.
 */
export function isModelFileName(name: string): boolean {
  return name.toLowerCase().endsWith(MODEL_EXTENSION)
}

/**
 * Serialize project fields to the NeoCombi file format. Whether the result is a
 * model (.ncombi) or a project (.ncproj) depends only on the caller: the test
 * set is emitted iff `input.testSuite` is non-null.
 *
 * The output ends with a single trailing newline. The annotations block, if
 * any, is placed after the source separated by one blank line so editors
 * preserving final newlines round-trip cleanly.
 */
export function serialize(input: TmodelFileContents): string {
  const cleanedSource = stripAnnotations(input.source).replace(/\n+$/, '')

  const annotations: string[] = []
  if (input.pictOrder !== DEFAULT_PICT_ORDER) {
    annotations.push(`${ANNOTATION_PREFIX}order ${input.pictOrder}`)
  }
  if (input.generationMode !== DEFAULT_GENERATION_MODE) {
    annotations.push(`${ANNOTATION_PREFIX}mode ${input.generationMode}`)
  }
  for (const ev of input.expectedValues) {
    annotations.push(formatExpectedAnnotation(ev))
  }
  if (input.testSuite && input.testSuite.rows.length > 0) {
    const suite = input.testSuite
    annotations.push(`${ANNOTATION_PREFIX}caseset-factors ${suite.factorOrder.map(encodeToken).join(' ')}`)
    for (const row of suite.rows) {
      annotations.push(formatCaseAnnotation(suite.factorOrder, row))
    }
  }

  const parts: string[] = []
  if (cleanedSource.length > 0) parts.push(cleanedSource)
  if (annotations.length > 0) {
    if (parts.length > 0) parts.push('')
    parts.push('# ===== NeoCombi annotations (auto-generated; do not edit) =====')
    parts.push(...annotations)
  }
  return parts.join('\n') + '\n'
}

/**
 * Parse a NeoCombi file (.ncombi / .ncproj / legacy .tmodel) into structured fields.
 *
 * Annotation lines and the auto-generated header line are removed from
 * `source`. Other lines (including ordinary `#` comments) are preserved
 * verbatim so the user's hand-written DSL round-trips.
 */
export function deserialize(content: string): TmodelLoadResult {
  const sourceLines: string[] = []
  const expectedValues: ExpectedValueEntry[] = []
  const warnings: TmodelLoadWarning[] = []
  let pictOrder = DEFAULT_PICT_ORDER
  let generationMode: GenerationMode = DEFAULT_GENERATION_MODE
  let casesetFactors: string[] | null = null
  const caseRows: TestCase[] = []

  const lines = content.split(/\r\n|\r|\n/)
  lines.forEach((line, idx) => {
    const trimmed = line.trimStart()
    const lineNumber = idx + 1
    if (trimmed.startsWith(ANNOTATION_PREFIX)) {
      const rest = trimmed.slice(ANNOTATION_PREFIX.length).trim()
      if (rest.startsWith('order')) {
        const n = parseOrderAnnotation(rest)
        if (n === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:order' })
        } else {
          pictOrder = n
        }
        return
      }
      if (rest.startsWith('mode')) {
        const m = parseModeAnnotation(rest)
        if (m === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:mode' })
        } else {
          generationMode = m
        }
        return
      }
      if (rest.startsWith('expected')) {
        const ev = parseExpectedAnnotation(rest)
        if (ev === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:expected' })
        } else {
          expectedValues.push(ev)
        }
        return
      }
      if (rest.startsWith('caseset-factors')) {
        const f = parseCasesetFactorsAnnotation(rest)
        if (f === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:caseset-factors' })
        } else {
          casesetFactors = f
        }
        return
      }
      if (rest.startsWith('case ') || rest === 'case') {
        const row = parseCaseAnnotation(rest)
        if (row === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:case' })
        } else {
          caseRows.push(row)
        }
        return
      }
      warnings.push({ line: lineNumber, text: line, reason: 'unknown @neocombi annotation' })
      return
    }
    if (ANNOTATIONS_HEADER_PATTERN.test(trimmed)) {
      // Drop the auto-generated separator header.
      return
    }
    sourceLines.push(line)
  })

  // Trim trailing empty lines that the strip may have left behind, but keep
  // a single trailing newline for source unless the source is empty.
  let source = sourceLines.join('\n').replace(/\n+$/, '')
  if (source.length > 0) source += '\n'

  let testSuite: TestSuite | null = null
  if (caseRows.length > 0) {
    const factorOrder = casesetFactors ?? deriveFactorOrder(caseRows)
    testSuite = { factorOrder, rows: caseRows }
  }

  return { source, expectedValues, pictOrder, generationMode, testSuite, warnings }
}

/** Fallback factor order when no caseset-factors line was present: first-seen keys. */
function deriveFactorOrder(rows: TestCase[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const k of Object.keys(row.values)) {
      if (!seen.has(k)) {
        seen.add(k)
        order.push(k)
      }
    }
  }
  return order
}

/**
 * Remove `# @neocombi:` annotation lines and the auto-generated header from
 * a source string. Used both at load time (to keep them out of the editor)
 * and at save time (to ensure we don't emit stale duplicates).
 */
export function stripAnnotations(source: string): string {
  return source
    .split(/\r\n|\r|\n/)
    .filter(l => !l.trimStart().startsWith(ANNOTATION_PREFIX))
    .filter(l => !ANNOTATIONS_HEADER_PATTERN.test(l.trimStart()))
    .join('\n')
}

// =============================================================================
// Annotation parsers
// =============================================================================

// Factor names and level values may legitimately contain spaces (the DSL's
// Identifier rule allows internal spaces, and quoted-string levels allow any
// character). The annotation grammar is whitespace-delimited, so a raw space in
// a name / value would split one token into two and corrupt the line. We
// percent-encode space (and the percent sign itself, so the encoding is
// reversible) inside every name / value token; splitting on whitespace then
// stays safe. `%` is encoded first on the way out and decoded last on the way
// in, so values that already contain `%NN` round-trip unchanged.
function encodeToken(s: string): string {
  return s.replace(/%/g, '%25').replace(/ /g, '%20')
}

function decodeToken(s: string): string {
  return s.replace(/%20/g, ' ').replace(/%25/g, '%')
}

function parseOrderAnnotation(rest: string): number | null {
  const match = rest.match(/^order\s+(\d+)\s*$/)
  if (!match) return null
  const n = Number.parseInt(match[1]!, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

function parseModeAnnotation(rest: string): GenerationMode | null {
  const match = rest.match(/^mode\s+(\S+)\s*$/)
  if (!match) return null
  const m = match[1]
  if (m === 'pairwise' || m === 'decision-table') return m
  return null
}

function parseExpectedAnnotation(rest: string): ExpectedValueEntry | null {
  const withoutKey = rest.replace(/^expected\s*/, '')
  // Split on the LAST unescaped `|` so user can mention `\|` inside the value text.
  const pipeIdx = lastUnescapedPipe(withoutKey)
  if (pipeIdx < 0) return null
  const assignmentText = withoutKey.slice(0, pipeIdx).trim()
  const valueText = withoutKey.slice(pipeIdx + 1).trim().replace(/\\\|/g, '|')
  const assignment: Record<string, string> = {}
  if (assignmentText.length > 0) {
    for (const pair of assignmentText.split(/\s+/)) {
      const eq = pair.indexOf('=')
      if (eq < 0) return null
      const k = decodeToken(pair.slice(0, eq).trim())
      const v = decodeToken(pair.slice(eq + 1).trim())
      if (!k) return null
      assignment[k] = v
    }
  }
  if (Object.keys(assignment).length === 0) return null
  return { assignment, value: valueText }
}

function lastUnescapedPipe(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '|') continue
    if (i > 0 && s[i - 1] === '\\') continue
    return i
  }
  return -1
}

// =============================================================================
// Persisted test set (UR-011)
// =============================================================================

function parseCasesetFactorsAnnotation(rest: string): string[] | null {
  const withoutKey = rest.replace(/^caseset-factors\s*/, '').trim()
  if (withoutKey.length === 0) return null
  return withoutKey.split(/\s+/).map(decodeToken)
}

/**
 * Format one persisted case as a `# @neocombi:case ...` line. Reserved keys
 * (id / count / forbidden) come first, then factor=level pairs in column order,
 * then ` | note`. Factor names and level values are percent-encoded (see
 * encodeToken) so spaces inside them survive the whitespace-delimited grammar.
 */
function formatCaseAnnotation(factorOrder: string[], row: TestCase): string {
  const parts: string[] = []
  if (row.forbidden === true) {
    // Forbidden decision-table row: not a test case, no id / count.
    parts.push('forbidden=1')
  } else {
    // A test case. Decision-table rows carry forbidden=0 to keep the mode
    // distinction on reload; pairwise rows (forbidden undefined) omit the key.
    if (row.forbidden === false) parts.push('forbidden=0')
    if (row.id !== undefined) parts.push(`id=${row.id}`)
    parts.push(`count=${row.count === false ? 0 : 1}`)
  }
  for (const name of factorOrder) {
    parts.push(`${encodeToken(name)}=${encodeToken(row.values[name] ?? '')}`)
  }
  const safeNote = (row.note ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
  return `${ANNOTATION_PREFIX}case ${parts.join(' ')} | ${safeNote}`
}

function parseCaseAnnotation(rest: string): TestCase | null {
  const withoutKey = rest.replace(/^case\s*/, '')
  const pipeIdx = lastUnescapedPipe(withoutKey)
  // The note section is required (even if empty) so we can always split it off.
  if (pipeIdx < 0) return null
  const assignmentText = withoutKey.slice(0, pipeIdx).trim()
  const note = withoutKey.slice(pipeIdx + 1).trim().replace(/\\\|/g, '|')

  const values: Record<string, string> = {}
  let id: string | undefined
  let count: boolean | undefined
  let forbidden = false
  if (assignmentText.length > 0) {
    for (const pair of assignmentText.split(/\s+/)) {
      const eq = pair.indexOf('=')
      if (eq < 0) return null
      const k = decodeToken(pair.slice(0, eq).trim())
      const v = decodeToken(pair.slice(eq + 1).trim())
      if (!k) return null
      if (k === 'id') id = v
      else if (k === 'count') count = v !== '0' && v !== 'false'
      else if (k === 'forbidden') forbidden = v === '1' || v === 'true' ? true : false
      else values[k] = v
    }
  }
  const hadForbiddenKey = assignmentText.includes('forbidden=')

  const row: TestCase = { values }
  if (forbidden) {
    row.forbidden = true
  } else {
    // forbidden=0 marks a decision-table test case; absence marks pairwise.
    if (hadForbiddenKey) row.forbidden = false
    if (id !== undefined) row.id = id
    row.count = count ?? true
  }
  if (note.length > 0) row.note = note
  return row
}

function formatExpectedAnnotation(ev: ExpectedValueEntry): string {
  const assignmentText = Object.entries(ev.assignment)
    .map(([k, v]) => `${encodeToken(k)}=${encodeToken(v)}`)
    .join(' ')
  // Newlines inside expected values would break the line-based annotation
  // format; collapse them to single spaces. Pipes are escaped.
  const safeValue = ev.value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
  return `${ANNOTATION_PREFIX}expected ${assignmentText} | ${safeValue}`
}
