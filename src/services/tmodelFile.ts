// .tmodel file (de)serialization.
//
// The .tmodel file is plain PICT DSL (subset) with a small set of NeoCombi-specific
// annotations expressed as PICT-compatible comments:
//
//   # @neocombi:order N                  PICT generation order N (default 2 omitted)
//   # @neocombi:expected K=V K=V | text  Expected value for the test case identified
//                                        by the given factor=level pairs. The pipe
//                                        separates the assignment from the free-text
//                                        expected output. Pipes inside the value are
//                                        escaped as `\|` and de-escaped on load.
//
// On load, annotations are extracted into structured fields and stripped from the
// returned `source`. On save, the source is emitted verbatim and a fresh annotations
// block is appended after a header comment line.

import type { ExpectedValueEntry } from '../types/project'

const ANNOTATION_PREFIX = '# @neocombi:'
const ANNOTATIONS_HEADER_PATTERN = /^# =+ NeoCombi annotations.*=+/
const DEFAULT_PICT_ORDER = 2

export type TmodelFileContents = {
  source: string
  expectedValues: ExpectedValueEntry[]
  pictOrder: number
}

export type TmodelLoadWarning = {
  line: number
  text: string
  reason: string
}

export type TmodelLoadResult = TmodelFileContents & {
  warnings: TmodelLoadWarning[]
}

/**
 * Serialize project fields to the .tmodel file format.
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
  for (const ev of input.expectedValues) {
    annotations.push(formatExpectedAnnotation(ev))
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
 * Parse a .tmodel file into structured fields.
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
      if (rest.startsWith('expected')) {
        const ev = parseExpectedAnnotation(rest)
        if (ev === null) {
          warnings.push({ line: lineNumber, text: line, reason: 'malformed @neocombi:expected' })
        } else {
          expectedValues.push(ev)
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

  return { source, expectedValues, pictOrder, warnings }
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

function parseOrderAnnotation(rest: string): number | null {
  const match = rest.match(/^order\s+(\d+)\s*$/)
  if (!match) return null
  const n = Number.parseInt(match[1]!, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return n
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
      const k = pair.slice(0, eq).trim()
      const v = pair.slice(eq + 1).trim()
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

function formatExpectedAnnotation(ev: ExpectedValueEntry): string {
  const assignmentText = Object.entries(ev.assignment)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  // Newlines inside expected values would break the line-based annotation
  // format; collapse them to single spaces. Pipes are escaped.
  const safeValue = ev.value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
  return `${ANNOTATION_PREFIX}expected ${assignmentText} | ${safeValue}`
}
