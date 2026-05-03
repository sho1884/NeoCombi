// Derive natural forbidden-matrix slices from the model's constraints.
//
// Intuition: each constraint encodes a relationship between factors, and the
// matrix view that makes that relationship legible is exactly the slice with
// THE factors mentioned in the condition on the row axis and THE factor
// mentioned in the consequence on the column axis. So we walk the AST and
// emit one slice per (condition factors -> constrained factor) pair.

import type { ConstraintNode, Model, Predicate } from '../../types/dsl'
import type { ForbiddenSliceConfig } from '../../types/project'

/**
 * Walk all constraints in the model and produce the slices a human would
 * naturally want to inspect to verify those constraints. Same {conditions,
 * constrained} pair is emitted at most once.
 *
 * Rules:
 * - `IF P THEN Q [ELSE R]`:
 *     row factors = factors mentioned in P
 *     for each factor mentioned in Q (or R) that is NOT already in P:
 *       emit ((row factors) -> that factor)
 *     If Q (and R) only mention factors that are already in P, the
 *     constraint restricts the same axis as the condition; emit each P
 *     factor in turn as the constrained one against the others.
 * - Unconditional `Predicate;`:
 *     factors = factors mentioned in the predicate
 *     emit ((all but one) -> last mentioned)
 *     Skipped when the predicate touches a single factor (one-axis check
 *     does not make sense in a 2D slice view).
 */
export function extractSuggestedSlices(model: Model): ForbiddenSliceConfig[] {
  const slices: ForbiddenSliceConfig[] = []
  const seen = new Set<string>()

  const emit = (conditions: string[], constrained: string): void => {
    if (conditions.length === 0 || !constrained) return
    const key =
      [...conditions].sort().join('|') + '::' + constrained
    if (seen.has(key)) return
    seen.add(key)
    slices.push({
      conditionFactors: [...conditions],
      constrainedFactor: constrained,
    })
  }

  for (const c of model.constraints) {
    extractFromConstraint(c, emit)
  }
  return slices
}

function extractFromConstraint(
  c: ConstraintNode,
  emit: (conditions: string[], constrained: string) => void,
): void {
  if (c.type === 'if') {
    const condFactors = orderedFactors(c.condition)
    const thenFactors = orderedFactors(c.then)
    const elseFactors = c.else ? orderedFactors(c.else) : []

    const condSet = new Set(condFactors)
    const targets: string[] = []
    for (const f of thenFactors) {
      if (!condSet.has(f) && !targets.includes(f)) targets.push(f)
    }
    for (const f of elseFactors) {
      if (!condSet.has(f) && !targets.includes(f)) targets.push(f)
    }

    if (targets.length > 0) {
      for (const t of targets) emit(condFactors, t)
      return
    }

    // THEN / ELSE references only the same factors as the condition.
    // Pivot each condition factor as the constrained one against the others
    // so the user still gets a 2D view per factor.
    for (const f of condSet) {
      const others = condFactors.filter(x => x !== f)
      if (others.length > 0) emit(others, f)
    }
    return
  }

  // Unconditional: emit (all-but-last -> last).
  const factors = orderedFactors(c.predicate)
  if (factors.length < 2) return
  const constrained = factors[factors.length - 1]!
  const conditions = factors.slice(0, -1)
  emit(conditions, constrained)
}

function orderedFactors(p: Predicate): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const visit = (name: string): void => {
    if (seen.has(name)) return
    seen.add(name)
    ordered.push(name)
  }
  walk(p, visit)
  return ordered
}

function walk(p: Predicate, visit: (factor: string) => void): void {
  switch (p.type) {
    case 'or':
    case 'and':
      walk(p.left, visit)
      walk(p.right, visit)
      return
    case 'not':
      walk(p.operand, visit)
      return
    case 'comparison':
      visit(p.left.name)
      if (p.right.type === 'paramRef') visit(p.right.name)
      return
    case 'in':
      visit(p.left.name)
      return
  }
}
