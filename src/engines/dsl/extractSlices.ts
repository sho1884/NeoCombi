// Derive natural forbidden-matrix slices from the model's constraints.
//
// Two kinds of suggestions are produced:
//
// 1. PER-CONSTRAINT slices. Each constraint encodes a relationship between
//    factors, and the matrix view that makes that relationship legible is
//    exactly the slice with the condition factors on the row axis and the
//    consequence factor on the column axis.
//
// 2. PROPAGATION slices. When the same factor appears in multiple
//    constraints, those constraints chain — restricting one factor can
//    transitively restrict another. Connected components of the
//    "co-occurs in some constraint" graph capture that chain scope, and
//    we emit one slice per pivot inside each component of size 3+ so the
//    user can see (A, B) => C cells where C is forbidden via the
//    A => B => C chain rather than via any single constraint alone.

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

  // 1. Per-constraint slices (immediate, single-constraint scope).
  for (const c of model.constraints) {
    extractFromConstraint(c, emit)
  }

  // 2. Propagation slices: one pivot per factor inside each connected
  //    component of size >= 3. Components of size 2 are already covered by
  //    the per-constraint emission above, so we skip them. Inside a chain
  //    A -> B -> C the propagation slice (A, B -> C) reveals cells that
  //    are forbidden via B even though no single constraint mentions both
  //    A and C.
  const components = connectedComponents(model)
  for (const component of components) {
    if (component.length < 3) continue
    for (const constrained of component) {
      const conditions = component.filter(f => f !== constrained)
      emit(conditions, constrained)
    }
  }

  return slices
}

/**
 * Group factors into connected components where two factors are connected
 * iff they co-occur in at least one constraint. The factors a constraint
 * touches are joined into one component regardless of which side of an
 * IF / THEN / ELSE they appeared on.
 *
 * Returns components of size >= 2 in declaration order; isolated factors
 * (no constraint references) are dropped because they do not affect any
 * forbidden combination.
 */
function connectedComponents(model: Model): string[][] {
  const parent = new Map<string, string>()
  for (const p of model.parameters) parent.set(p.name, p.name)

  const find = (x: string): string => {
    let cur = x
    let next = parent.get(cur) ?? cur
    while (next !== cur) {
      cur = next
      next = parent.get(cur) ?? cur
    }
    return cur
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const c of model.constraints) {
    const factors = factorsInConstraint(c)
    for (let i = 1; i < factors.length; i++) {
      union(factors[0]!, factors[i]!)
    }
  }

  // Preserve declaration order inside each component.
  const groups = new Map<string, string[]>()
  for (const p of model.parameters) {
    if (!parent.has(p.name)) continue
    const root = find(p.name)
    let g = groups.get(root)
    if (!g) {
      g = []
      groups.set(root, g)
    }
    g.push(p.name)
  }
  return Array.from(groups.values()).filter(g => g.length >= 2)
}

function factorsInConstraint(c: ConstraintNode): string[] {
  const set = new Set<string>()
  const visit = (name: string): void => {
    set.add(name)
  }
  if (c.type === 'if') {
    walk(c.condition, visit)
    walk(c.then, visit)
    if (c.else) walk(c.else, visit)
  } else {
    walk(c.predicate, visit)
  }
  return Array.from(set)
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
