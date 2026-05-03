// PICT (the upstream Microsoft source build we ship in pict-service)
// cannot handle UTF-8 multi-byte characters in factor or level names.
// Multi-byte factor names cause an infinite parse loop (timeout / OOM-kill);
// multi-byte level values silently produce empty / corrupt output.
//
// To let users keep authoring DSL in Japanese (the HAYST workflow), we
// transparently alias every non-ASCII identifier to an ASCII token before
// sending the model to PICT, then map the column headers and cell values
// back to the original strings in the response.
//
// Aliases are deterministic per-Model (factors numbered in declaration
// order, levels numbered within each factor) so the same model always
// produces the same alias table — useful for snapshot testing and for
// the user mentally tracing what PICT actually saw if they peek at the
// service logs.

import type { Model } from '../types/dsl'

/** A single text edit: replace `[start, end)` in the source with `replacement`. */
type Edit = { start: number; end: number; replacement: string }

export type AliasMap = {
  /** original factor name → ASCII alias. Identity for already-ASCII names. */
  factor: Map<string, string>
  /** ASCII alias → original factor name. Inverse of `factor`. */
  factorReverse: Map<string, string>
  /**
   * For each factor, original level value → ASCII alias. Keyed by the
   * factor's *original* name. Identity for already-ASCII level values.
   */
  level: Map<string, Map<string, string>>
  /**
   * For each factor, ASCII alias level → original level value. Keyed by
   * the factor's *original* name. Inverse of `level`.
   */
  levelReverse: Map<string, Map<string, string>>
}

const EMPTY_ALIAS_MAP: AliasMap = {
  factor: new Map(),
  factorReverse: new Map(),
  level: new Map(),
  levelReverse: new Map(),
}

/** Returns true if `s` contains any byte outside the 7-bit ASCII range. */
export function hasNonAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(s)
}

/** True iff the model contains at least one factor name or level value
 *  that needs aliasing. Cheap pre-check so the all-ASCII fast path skips
 *  every walk and copy below. */
export function modelNeedsAliasing(model: Model): boolean {
  for (const p of model.parameters) {
    if (hasNonAscii(p.name)) return true
    for (const lv of p.levels) {
      if (hasNonAscii(String(lv.value))) return true
    }
  }
  return false
}

/**
 * Build an alias map and a rewritten source string ready to send to PICT.
 *
 * The rewrite covers:
 *   - parameter declarations (the name and each level value literal)
 *   - parameter references inside constraints (`[Name]` → `[alias]`)
 *   - level value literals inside constraint comparisons and IN clauses
 *
 * Already-ASCII strings pass through unchanged. If nothing in the model
 * needs aliasing, returns the original source and an empty map.
 */
export function aliasForPict(
  source: string,
  model: Model,
): { source: string; aliasMap: AliasMap } {
  if (!modelNeedsAliasing(model)) {
    return { source, aliasMap: EMPTY_ALIAS_MAP }
  }

  const aliasMap: AliasMap = {
    factor: new Map(),
    factorReverse: new Map(),
    level: new Map(),
    levelReverse: new Map(),
  }

  // Build the alias table first (independent of the source rewrite).
  let nextFactorId = 1
  for (const p of model.parameters) {
    let factorAlias = p.name
    if (hasNonAscii(p.name)) {
      factorAlias = `_F${nextFactorId++}`
      aliasMap.factor.set(p.name, factorAlias)
      aliasMap.factorReverse.set(factorAlias, p.name)
    }
    let nextLevelId = 1
    for (const lv of p.levels) {
      const original = String(lv.value)
      if (hasNonAscii(original)) {
        const levelAlias = `_L${nextLevelId++}`
        let fwd = aliasMap.level.get(p.name)
        if (!fwd) {
          fwd = new Map()
          aliasMap.level.set(p.name, fwd)
        }
        fwd.set(original, levelAlias)
        let rev = aliasMap.levelReverse.get(p.name)
        if (!rev) {
          rev = new Map()
          aliasMap.levelReverse.set(p.name, rev)
        }
        rev.set(levelAlias, original)
      }
    }
  }

  // Collect text edits by walking the AST.
  const edits: Edit[] = []

  for (const p of model.parameters) {
    const factorAlias = aliasMap.factor.get(p.name)
    if (factorAlias) {
      edits.push({
        start: p.nameRange.start.offset,
        end: p.nameRange.end.offset,
        replacement: factorAlias,
      })
    }
    const levelMap = aliasMap.level.get(p.name)
    if (levelMap) {
      for (const lv of p.levels) {
        const original = String(lv.value)
        const alias = levelMap.get(original)
        if (!alias) continue
        edits.push({
          start: lv.range.start.offset,
          end: lv.range.end.offset,
          replacement: levelLiteralReplacement(lv, alias),
        })
      }
    }
  }

  for (const c of model.constraints) {
    walkConstraint(c, aliasMap, edits)
  }

  // Apply edits right-to-left so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start)
  let out = source
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }

  return { source: out, aliasMap }
}

/**
 * Map PICT's TSV output back to the original factor / level names.
 * Header row = factor names; subsequent rows = level values, one per
 * factor in column order.
 *
 * If `aliasMap` is empty (the model had no non-ASCII strings) this is
 * a no-op — return the input unchanged.
 */
export function unaliasTsv(tsv: string, aliasMap: AliasMap): string {
  if (aliasMap.factor.size === 0 && aliasMap.level.size === 0) return tsv

  const lines = tsv.split('\n')
  if (lines.length === 0) return tsv

  // Detect & preserve trailing newline.
  let trailingNewline = ''
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    trailingNewline = '\n'
    lines.pop()
  }
  if (lines.length === 0) return tsv

  const headerCells = lines[0]!.split('\t')
  const originalFactors: string[] = headerCells.map(
    cell => aliasMap.factorReverse.get(cell) ?? cell,
  )
  const out: string[] = [originalFactors.join('\t')]

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.length === 0) {
      out.push(line)
      continue
    }
    const cells = line.split('\t')
    const restored = cells.map((cell, idx) => {
      const factor = originalFactors[idx]
      if (!factor) return cell
      const reverseLevels = aliasMap.levelReverse.get(factor)
      if (!reverseLevels) return cell
      return reverseLevels.get(cell) ?? cell
    })
    out.push(restored.join('\t'))
  }

  return out.join('\n') + trailingNewline
}

// =============================================================================
// internals
// =============================================================================

function levelLiteralReplacement(
  lv: Model['parameters'][number]['levels'][number],
  alias: string,
): string {
  switch (lv.type) {
    case 'string':
      // Quoted string literal — preserve the quotes. PICT requires quotes
      // for strings with spaces; aliases never contain spaces but we
      // mirror the original syntactic form to keep the diff visually
      // localised in case anyone reads service logs.
      return `"${alias}"`
    case 'identifier':
      return alias
    case 'number':
      // Numeric literals are by definition ASCII; this branch should be
      // unreachable in practice but is kept here for exhaustiveness.
      return alias
  }
}

function walkConstraint(
  c: Model['constraints'][number],
  aliasMap: AliasMap,
  edits: Edit[],
): void {
  if (c.type === 'if') {
    walkPredicate(c.condition, aliasMap, edits)
    walkPredicate(c.then, aliasMap, edits)
    if (c.else) walkPredicate(c.else, aliasMap, edits)
  } else {
    walkPredicate(c.predicate, aliasMap, edits)
  }
}

function walkPredicate(
  p: import('../types/dsl').Predicate,
  aliasMap: AliasMap,
  edits: Edit[],
): void {
  switch (p.type) {
    case 'and':
    case 'or':
      walkPredicate(p.left, aliasMap, edits)
      walkPredicate(p.right, aliasMap, edits)
      return
    case 'not':
      walkPredicate(p.operand, aliasMap, edits)
      return
    case 'comparison': {
      pushFactorRefEdit(p.left, aliasMap, edits)
      if (p.right.type === 'paramRef') {
        pushFactorRefEdit(p.right, aliasMap, edits)
      } else {
        pushLevelLiteralEdit(p.left.name, p.right, aliasMap, edits)
      }
      return
    }
    case 'in': {
      pushFactorRefEdit(p.left, aliasMap, edits)
      for (const v of p.values) {
        pushLevelLiteralEdit(p.left.name, v, aliasMap, edits)
      }
      return
    }
  }
}

function pushFactorRefEdit(
  ref: import('../types/dsl').ParameterRef,
  aliasMap: AliasMap,
  edits: Edit[],
): void {
  const alias = aliasMap.factor.get(ref.name)
  if (!alias) return
  edits.push({
    start: ref.range.start.offset,
    end: ref.range.end.offset,
    replacement: `[${alias}]`,
  })
}

function pushLevelLiteralEdit(
  factor: string,
  literal: import('../types/dsl').ValueLiteral,
  aliasMap: AliasMap,
  edits: Edit[],
): void {
  const levelMap = aliasMap.level.get(factor)
  if (!levelMap) return
  const original = String(literal.value)
  const alias = levelMap.get(original)
  if (!alias) return
  edits.push({
    start: literal.range.start.offset,
    end: literal.range.end.offset,
    replacement: levelLiteralReplacement(literal, alias),
  })
}
