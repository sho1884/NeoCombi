import type {
  Assignment,
  CompareOp,
  Comparison,
  ConstraintNode,
  EvaluationOutcome,
  FactorTypeInfo,
  ForbiddenSliceCell,
  ForbiddenSliceResult,
  IfStatement,
  InClause,
  LevelNode,
  LevelValue,
  Model,
  ModelTypeInfo,
  Predicate,
  UnconditionalConstraint,
} from '../../types/dsl'

/**
 * Maximum total number of full assignments to enumerate before bailing out.
 * For a model with K factors and average cardinality L, total = L^K. The
 * brute-force isPartiallyForbidden walks this space; we refuse to start when
 * it would clearly be intractable.
 */
export const DEFAULT_ENUMERATION_LIMIT = 1_000_000

// =============================================================================
// Type info derivation
// =============================================================================

/**
 * Inspect a Model and derive factor type info (numeric vs string) and the
 * level value list per factor. PICT rule: a parameter is numeric iff all its
 * declared levels parse as numbers.
 */
export function buildTypeInfo(model: Model): ModelTypeInfo {
  const factors: FactorTypeInfo[] = model.parameters.map(p => {
    const isAllNumeric = p.levels.length > 0 && p.levels.every(l => l.type === 'number')
    const type = isAllNumeric ? 'numeric' : 'string'
    const levels: LevelValue[] = p.levels.map(l => levelNodeValue(l, type))
    return { name: p.name, type, levels }
  })
  const byName = new Map<string, FactorTypeInfo>()
  for (const f of factors) byName.set(f.name, f)
  return { factors, byName }
}

function levelNodeValue(node: LevelNode, type: 'numeric' | 'string'): LevelValue {
  if (type === 'numeric') {
    return typeof node.value === 'number' ? node.value : Number(node.value)
  }
  return String(node.value)
}

// =============================================================================
// Predicate evaluation
// =============================================================================

/**
 * Evaluate a predicate against a (possibly partial) assignment. Returns:
 *   true  — predicate is definitely satisfied by this assignment
 *   false — predicate is definitely violated
 *
 * If a predicate refers to an unassigned factor or has a type mismatch,
 * the evaluator treats the comparison as false. Higher-level callers are
 * expected to ensure full assignments before relying on a true result.
 */
export function evalPredicate(
  p: Predicate,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  switch (p.type) {
    case 'or':
      return evalPredicate(p.left, assignment, info) || evalPredicate(p.right, assignment, info)
    case 'and':
      return evalPredicate(p.left, assignment, info) && evalPredicate(p.right, assignment, info)
    case 'not':
      return !evalPredicate(p.operand, assignment, info)
    case 'comparison':
      return evalComparison(p, assignment, info)
    case 'in':
      return evalIn(p, assignment, info)
  }
}

function evalComparison(
  c: Comparison,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  const leftFactor = info.byName.get(c.left.name)
  if (!leftFactor) return false
  const leftValue = assignment[c.left.name]
  if (leftValue === undefined) return false

  let rightValue: LevelValue | undefined
  if (c.right.type === 'paramRef') {
    const rf = info.byName.get(c.right.name)
    if (!rf) return false
    rightValue = assignment[c.right.name]
  } else {
    rightValue = literalValueAs(c.right, leftFactor.type)
  }
  if (rightValue === undefined) return false

  return compareValues(leftValue, c.op, rightValue, leftFactor.type)
}

function evalIn(
  e: InClause,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  const factor = info.byName.get(e.left.name)
  if (!factor) return false
  const lhs = assignment[e.left.name]
  if (lhs === undefined) return false
  for (const v of e.values) {
    const rhs = literalValueAs(v, factor.type)
    if (rhs === undefined) continue
    if (equals(lhs, rhs, factor.type)) return true
  }
  return false
}

function literalValueAs(
  node: { type: 'string' | 'number' | 'identifier'; value: string | number },
  factorType: 'numeric' | 'string',
): LevelValue | undefined {
  if (factorType === 'numeric') {
    if (typeof node.value === 'number') return node.value
    const n = Number(node.value)
    return Number.isFinite(n) ? n : undefined
  }
  return String(node.value)
}

function compareValues(
  a: LevelValue,
  op: CompareOp,
  b: LevelValue,
  factorType: 'numeric' | 'string',
): boolean {
  if (factorType === 'numeric') {
    const na = typeof a === 'number' ? a : Number(a)
    const nb = typeof b === 'number' ? b : Number(b)
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return false
    switch (op) {
      case '=': return na === nb
      case '<>': return na !== nb
      case '>': return na > nb
      case '>=': return na >= nb
      case '<': return na < nb
      case '<=': return na <= nb
    }
  }
  const sa = String(a)
  const sb = String(b)
  switch (op) {
    case '=': return sa === sb
    case '<>': return sa !== sb
    case '>': return sa > sb
    case '>=': return sa >= sb
    case '<': return sa < sb
    case '<=': return sa <= sb
  }
}

function equals(a: LevelValue, b: LevelValue, factorType: 'numeric' | 'string'): boolean {
  return compareValues(a, '=', b, factorType)
}

// =============================================================================
// Constraint satisfaction over full assignments
// =============================================================================

export function isConstraintSatisfied(
  c: ConstraintNode,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  if (c.type === 'if') {
    return isIfSatisfied(c, assignment, info)
  }
  return isUnconditionalSatisfied(c, assignment, info)
}

function isIfSatisfied(
  c: IfStatement,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  const cond = evalPredicate(c.condition, assignment, info)
  if (cond) {
    return evalPredicate(c.then, assignment, info)
  }
  if (c.else) {
    return evalPredicate(c.else, assignment, info)
  }
  // No ELSE: when the condition is false, the constraint imposes nothing.
  return true
}

function isUnconditionalSatisfied(
  c: UnconditionalConstraint,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  return evalPredicate(c.predicate, assignment, info)
}

export function isAssignmentValid(
  model: Model,
  assignment: Assignment,
  info: ModelTypeInfo,
): boolean {
  for (const c of model.constraints) {
    if (!isConstraintSatisfied(c, assignment, info)) return false
  }
  return true
}

// =============================================================================
// Slice enumeration / forbidden detection
// =============================================================================

/**
 * Decide whether a partial assignment (over a subset of factors) is forbidden
 * by the model. A partial assignment is forbidden iff no extension to all
 * factors satisfies every constraint.
 *
 * Scaling: rather than enumerating every full assignment, we restrict
 * enumeration to the constraint-reachable closure of the partial's factors
 * — factors transitively connected via "co-occur in a constraint". Factors
 * outside that closure cannot be constrained by the partial, so they don't
 * influence feasibility (assuming the model is globally satisfiable). This
 * keeps the enumeration tractable on 100+ factor models with sparse
 * constraints.
 */
export function isPartiallyForbidden(
  model: Model,
  partial: Assignment,
  info: ModelTypeInfo,
  options: { limit?: number } = {},
): EvaluationOutcome<boolean> {
  const limit = options.limit ?? DEFAULT_ENUMERATION_LIMIT

  // Validate factor names in the partial assignment.
  for (const name of Object.keys(partial)) {
    if (!info.byName.has(name)) {
      return failure('unknown-factor', `Unknown factor: ${name}`)
    }
  }

  // If any factor has zero levels, the model is malformed; partial cannot be evaluated.
  if (info.factors.some(f => f.levels.length === 0)) {
    return failure('invalid-model', 'Model contains a factor with no levels')
  }

  const partialKeys = new Set(Object.keys(partial))
  const { relevantFactorNames, relevantConstraints } = relevantSubmodel(
    model,
    partialKeys,
  )

  // No constraint touches the partial's factors → the partial can never be
  // forbidden. (extractSlices guarantees the slice's factors are connected,
  // but unconditional forbiddenness should still short-circuit cleanly.)
  if (relevantConstraints.length === 0) {
    return { ok: true, value: false }
  }

  // Free factors = reachable factors not yet fixed by `partial`.
  const freeFactors = info.factors.filter(
    f => relevantFactorNames.has(f.name) && !partialKeys.has(f.name),
  )

  // Total enumeration size = product of free-factor cardinalities.
  let total = 1
  for (const f of freeFactors) {
    total *= f.levels.length
    if (total > limit) {
      return failure(
        'too-large',
        `Enumeration would exceed limit (${limit}); reduce factor cardinalities or N`,
      )
    }
  }

  // Enumerate over the reachable closure only; check only relevant
  // constraints. Found-valid means the partial assignment is feasible
  // (NOT forbidden).
  let foundValid = false
  enumerateExtensions(freeFactors, 0, { ...partial }, assignment => {
    for (const c of relevantConstraints) {
      if (!isConstraintSatisfied(c, assignment, info)) return true
    }
    foundValid = true
    return false
  })

  return { ok: true, value: !foundValid }
}

/**
 * Compute the constraint-reachable closure: factors transitively connected
 * to `seed` via "co-occur in some constraint", together with the set of
 * constraints whose factors all lie inside that closure (which is the same
 * as constraints touching at least one closure factor, by reachability).
 */
function relevantSubmodel(
  model: Model,
  seed: Set<string>,
): { relevantFactorNames: Set<string>; relevantConstraints: ConstraintNode[] } {
  const constraintFactors: Array<Set<string>> = model.constraints.map(c =>
    factorsTouched(c),
  )
  const reach = new Set(seed)
  let changed = true
  while (changed) {
    changed = false
    for (const fs of constraintFactors) {
      let touches = false
      for (const f of fs) {
        if (reach.has(f)) {
          touches = true
          break
        }
      }
      if (!touches) continue
      for (const f of fs) {
        if (!reach.has(f)) {
          reach.add(f)
          changed = true
        }
      }
    }
  }
  const relevantConstraints: ConstraintNode[] = []
  for (let i = 0; i < model.constraints.length; i++) {
    const fs = constraintFactors[i]!
    if (fs.size === 0) continue
    let touches = false
    for (const f of fs) {
      if (reach.has(f)) {
        touches = true
        break
      }
    }
    if (touches) relevantConstraints.push(model.constraints[i]!)
  }
  return { relevantFactorNames: reach, relevantConstraints }
}

function factorsTouched(c: ConstraintNode): Set<string> {
  const set = new Set<string>()
  const visit = (p: Predicate): void => {
    switch (p.type) {
      case 'or':
      case 'and':
        visit(p.left)
        visit(p.right)
        return
      case 'not':
        visit(p.operand)
        return
      case 'comparison':
        set.add(p.left.name)
        if (p.right.type === 'paramRef') set.add(p.right.name)
        return
      case 'in':
        set.add(p.left.name)
        return
    }
  }
  if (c.type === 'if') {
    visit(c.condition)
    visit(c.then)
    if (c.else) visit(c.else)
  } else {
    visit(c.predicate)
  }
  return set
}

function enumerateExtensions(
  factors: FactorTypeInfo[],
  index: number,
  current: Assignment,
  visit: (assignment: Assignment) => boolean,
): boolean {
  if (index === factors.length) {
    return visit(current)
  }
  const factor = factors[index]!
  for (const lv of factor.levels) {
    current[factor.name] = lv
    const cont = enumerateExtensions(factors, index + 1, current, visit)
    if (!cont) {
      delete current[factor.name]
      return false
    }
  }
  delete current[factor.name]
  return true
}

/**
 * Enumerate the slice (Cartesian product of the named factors' levels) and
 * mark each combination forbidden / allowed.
 *
 * Order of `factors` is preserved in the output and reflects the row / column
 * order callers may want for matrix layout (SR-031).
 */
export function computeForbiddenSlice(
  model: Model,
  factors: string[],
  options: { limit?: number } = {},
): EvaluationOutcome<ForbiddenSliceResult> {
  const info = buildTypeInfo(model)

  // Validate factor names.
  for (const name of factors) {
    if (!info.byName.has(name)) {
      return failure('unknown-factor', `Unknown factor: ${name}`)
    }
  }

  // Slice cardinality guard.
  const limit = options.limit ?? DEFAULT_ENUMERATION_LIMIT
  let sliceSize = 1
  for (const name of factors) {
    sliceSize *= info.byName.get(name)!.levels.length
    if (sliceSize > limit) {
      return failure(
        'too-large',
        `Slice cardinality (${sliceSize}+) exceeds limit (${limit})`,
      )
    }
  }

  const cells: ForbiddenSliceCell[] = []
  const sliceFactorInfos = factors.map(n => info.byName.get(n)!)

  let aborted: EvaluationOutcome<ForbiddenSliceResult> | null = null
  enumerateExtensions(sliceFactorInfos, 0, {}, assignment => {
    const partial: Assignment = { ...assignment }
    const result = isPartiallyForbidden(model, partial, info, options)
    if (!result.ok) {
      aborted = result
      return false
    }
    cells.push({ assignment: partial, forbidden: result.value })
    return true
  })

  if (aborted) return aborted
  return { ok: true, value: { cells, factors } }
}

function failure(reason: 'unknown-factor' | 'too-large' | 'invalid-model', message: string): EvaluationOutcome<never> {
  return { ok: false, reason, message }
}
