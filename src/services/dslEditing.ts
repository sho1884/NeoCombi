// Pure source-text manipulation helpers for the Factors & Levels inline editor
// (SR-010..012). All functions take a source string and return a new source
// string; they re-parse the source to locate AST node ranges, then apply
// precise text edits using those ranges. Comments, whitespace, and constraint
// section formatting are preserved.

import { parse } from '../engines/dsl'
import type {
  ConstraintNode,
  LevelNode,
  ParameterRef,
  Predicate,
  ValueLiteral,
} from '../types/dsl'

type Edit = { start: number; end: number; text: string }

function applyEdits(source: string, edits: Edit[]): string {
  // Sort by start offset descending so each edit's offsets remain valid as we
  // splice text from end to beginning.
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  return sorted.reduce(
    (s, e) => s.slice(0, e.start) + e.text + s.slice(e.end),
    source,
  )
}

function forEachParameterRef(
  node: ConstraintNode | Predicate,
  visit: (ref: ParameterRef) => void,
): void {
  switch (node.type) {
    case 'if':
      forEachParameterRef(node.condition, visit)
      forEachParameterRef(node.then, visit)
      if (node.else) forEachParameterRef(node.else, visit)
      return
    case 'unconditional':
      forEachParameterRef(node.predicate, visit)
      return
    case 'or':
    case 'and':
      forEachParameterRef(node.left, visit)
      forEachParameterRef(node.right, visit)
      return
    case 'not':
      forEachParameterRef(node.operand, visit)
      return
    case 'comparison':
      visit(node.left)
      if (node.right.type === 'paramRef') visit(node.right)
      return
    case 'in':
      visit(node.left)
      return
  }
}

/**
 * Rename a factor across the entire DSL source. Replaces the factor name in
 * its declaration AND in every `[oldName]` reference inside constraints.
 *
 * Returns the source unchanged when:
 *   - newName equals oldName
 *   - the factor does not exist
 *   - parsing fails (we refuse to edit a malformed source)
 */
export function renameFactor(
  source: string,
  oldName: string,
  newName: string,
): string {
  if (oldName === newName) return source
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === oldName)
  if (!factor) return source

  const edits: Edit[] = [
    {
      start: factor.nameRange.start.offset,
      end: factor.nameRange.end.offset,
      text: newName,
    },
  ]
  for (const c of model.constraints) {
    forEachParameterRef(c, ref => {
      if (ref.name === oldName) {
        edits.push({
          start: ref.range.start.offset,
          end: ref.range.end.offset,
          text: '[' + newName + ']',
        })
      }
    })
  }
  return applyEdits(source, edits)
}

/**
 * Append a new factor declaration after the last existing parameter. When
 * the source has no parameters yet, prepend the declaration at the top.
 */
export function addFactor(
  source: string,
  name: string,
  levels: string[] = ['Level1', 'Level2'],
): string {
  const declLine = `${name}: ${levels.join(', ')}`
  const { model } = parse(source)
  if (!model || model.parameters.length === 0) {
    if (source.length === 0) return declLine + '\n'
    const sep = source.startsWith('\n') ? '' : '\n'
    return declLine + sep + source
  }
  const last = model.parameters[model.parameters.length - 1]!
  const insertAt = last.range.end.offset
  return source.slice(0, insertAt) + '\n' + declLine + source.slice(insertAt)
}

/**
 * Remove a factor's declaration line from the source. Constraints that
 * reference the removed factor are left in place; they will surface as
 * parse / evaluator errors so the user can clean them up explicitly.
 */
export function removeFactor(source: string, name: string): string {
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === name)
  if (!factor) return source

  const start = factor.range.start.offset
  let end = factor.range.end.offset
  // Consume one trailing newline if present so the line vanishes cleanly.
  if (source[end] === '\r' && source[end + 1] === '\n') {
    end += 2
  } else if (source[end] === '\n') {
    end += 1
  } else if (start > 0 && source[start - 1] === '\n') {
    // No trailing newline (last line of file): consume the preceding newline
    // so we don't leave a dangling blank line.
    return source.slice(0, start - 1) + source.slice(end)
  }
  return source.slice(0, start) + source.slice(end)
}

/**
 * Append a level to a factor's level list (`, NewLevel`).
 */
export function addLevelToFactor(
  source: string,
  factorName: string,
  newLevel: string,
): string {
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === factorName)
  if (!factor) return source
  if (factor.levels.length === 0) {
    // No existing levels: insert directly after the colon (sigh — locating the
    // colon precisely without lexer help means scanning. Approximate: insert
    // after the factor declaration's name and a colon-space prefix.)
    const insertAt = factor.range.end.offset
    return source.slice(0, insertAt) + ' ' + newLevel + source.slice(insertAt)
  }
  const insertAt = factor.range.end.offset
  return source.slice(0, insertAt) + ', ' + newLevel + source.slice(insertAt)
}

/**
 * Rename a level value across the source. Updates the level token in the
 * factor's declaration AND any references in constraint clauses
 * (`[Factor] = "oldValue"`, `[Factor] IN { "oldValue", ... }`, and
 * parameter-to-value comparisons in either direction).
 *
 * The token type ('string' / 'identifier' / 'number') of each occurrence is
 * preserved when re-emitting the new value: a quoted-string occurrence stays
 * quoted, a bare-identifier occurrence stays bare, etc.
 */
export function renameLevel(
  source: string,
  factorName: string,
  oldValue: string,
  newValue: string,
): string {
  if (oldValue === newValue) return source
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === factorName)
  if (!factor) return source
  const target = factor.levels.find(l => String(l.value) === oldValue)
  if (!target) return source

  const edits: Edit[] = []
  edits.push({
    start: target.range.start.offset,
    end: target.range.end.offset,
    text: formatValueAs(target, newValue),
  })

  // Walk constraints and rewrite every value literal that refers to this
  // factor's old level. Track the "host" parameter of each comparison /
  // IN-clause so we know whether the literal targets our factor.
  for (const c of model.constraints) {
    forEachValueLiteralWithHost(c, (hostFactor, value) => {
      if (hostFactor !== factorName) return
      if (String(value.value) !== oldValue) return
      edits.push({
        start: value.range.start.offset,
        end: value.range.end.offset,
        text: formatValueAs(value, newValue),
      })
    })
  }
  return applyEdits(source, edits)
}

/**
 * Swap a parameter declaration with its neighbour in declaration order.
 * Returns the source unchanged when the move is impossible (already at
 * an end, factor missing).
 */
export function moveFactor(
  source: string,
  factorName: string,
  direction: 'up' | 'down',
): string {
  const { model } = parse(source)
  if (!model) return source
  const idx = model.parameters.findIndex(p => p.name === factorName)
  if (idx < 0) return source
  if (direction === 'up' && idx === 0) return source
  if (direction === 'down' && idx === model.parameters.length - 1) return source

  const earlier =
    direction === 'up' ? model.parameters[idx - 1]! : model.parameters[idx]!
  const later =
    direction === 'up' ? model.parameters[idx]! : model.parameters[idx + 1]!
  return swapTextRanges(source, earlier.range.start.offset, earlier.range.end.offset, later.range.start.offset, later.range.end.offset)
}

/**
 * Swap a level with its neighbour inside a factor's level list.
 */
export function moveLevel(
  source: string,
  factorName: string,
  levelValue: string,
  direction: 'up' | 'down',
): string {
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === factorName)
  if (!factor) return source
  const idx = factor.levels.findIndex(l => String(l.value) === levelValue)
  if (idx < 0) return source
  if (direction === 'up' && idx === 0) return source
  if (direction === 'down' && idx === factor.levels.length - 1) return source

  const earlier = direction === 'up' ? factor.levels[idx - 1]! : factor.levels[idx]!
  const later = direction === 'up' ? factor.levels[idx]! : factor.levels[idx + 1]!
  return swapTextRanges(source, earlier.range.start.offset, earlier.range.end.offset, later.range.start.offset, later.range.end.offset)
}

function swapTextRanges(
  source: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): string {
  if (aStart > bStart) {
    return swapTextRanges(source, bStart, bEnd, aStart, aEnd)
  }
  // a comes before b; reassemble with their texts swapped.
  const aText = source.slice(aStart, aEnd)
  const bText = source.slice(bStart, bEnd)
  return (
    source.slice(0, aStart) +
    bText +
    source.slice(aEnd, bStart) +
    aText +
    source.slice(bEnd)
  )
}

function formatValueAs(
  template: LevelNode | ValueLiteral,
  newValue: string,
): string {
  if (template.type === 'string') {
    return '"' + newValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  // Numeric literals: emit the new value as-is. The caller is responsible for
  // ensuring the value parses as a number when the factor was numeric;
  // otherwise PICT will surface the type mismatch on the next parse.
  // Identifier literals: emit bare.
  return newValue
}

function forEachValueLiteralWithHost(
  node: ConstraintNode | Predicate,
  visit: (hostFactor: string, value: ValueLiteral) => void,
): void {
  switch (node.type) {
    case 'if':
      forEachValueLiteralWithHost(node.condition, visit)
      forEachValueLiteralWithHost(node.then, visit)
      if (node.else) forEachValueLiteralWithHost(node.else, visit)
      return
    case 'unconditional':
      forEachValueLiteralWithHost(node.predicate, visit)
      return
    case 'or':
    case 'and':
      forEachValueLiteralWithHost(node.left, visit)
      forEachValueLiteralWithHost(node.right, visit)
      return
    case 'not':
      forEachValueLiteralWithHost(node.operand, visit)
      return
    case 'comparison':
      if (node.right.type !== 'paramRef') {
        visit(node.left.name, node.right)
      }
      return
    case 'in':
      for (const v of node.values) visit(node.left.name, v)
      return
  }
}

/**
 * Remove a level from a factor's level list, including the comma that
 * separates it from its neighbours. If removing the last remaining level
 * would empty the list, the operation is refused (returns source unchanged).
 */
export function removeLevelFromFactor(
  source: string,
  factorName: string,
  levelValue: string,
): string {
  const { model } = parse(source)
  if (!model) return source
  const factor = model.parameters.find(p => p.name === factorName)
  if (!factor) return source
  const idx = factor.levels.findIndex(l => String(l.value) === levelValue)
  if (idx < 0) return source
  if (factor.levels.length <= 1) return source

  const target = factor.levels[idx]!
  let start = target.range.start.offset
  let end = target.range.end.offset
  if (idx > 0) {
    // Drop everything from the previous level's end (which absorbs the
    // separating comma and surrounding whitespace) up to this level's end.
    const prev = factor.levels[idx - 1]!
    start = prev.range.end.offset
  } else {
    // First level: also absorb the following comma so the second level
    // becomes the new first.
    const next = factor.levels[idx + 1]!
    end = next.range.start.offset
  }
  return source.slice(0, start) + source.slice(end)
}
