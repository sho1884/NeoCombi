// Semantic validation pass over a parsed Model.
//
// The parser only checks syntax (and a handful of duplicate-declaration
// rules). This pass catches the next layer of bugs that PICT would
// otherwise discover noisily at generation time:
//
//   - constraints referencing an undeclared parameter
//   - equality / inequality / IN clauses comparing against a value that
//     was never declared as a level on the parameter
//
// Both produce structured diagnostics with the offending token's range,
// so the DSL editor can underline them like any other parse error.

import type {
  Comparison,
  ConstraintNode,
  Diagnostic,
  InClause,
  Model,
  ParameterDecl,
  ParameterRef,
  Predicate,
  ValueLiteral,
} from '../../types/dsl'
import { MASK_LEVEL, isMaskLevelNode } from './maskLevel'

export function validateModel(model: Model): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const factorsByName = new Map<string, ParameterDecl>()
  for (const p of model.parameters) factorsByName.set(p.name, p)

  for (const c of model.constraints) {
    walkConstraintPredicates(c, predicate => {
      if (predicate.type === 'comparison') {
        validateComparison(predicate, factorsByName, diagnostics)
      } else if (predicate.type === 'in') {
        validateInClause(predicate, factorsByName, diagnostics)
      }
    })
  }
  validateMaskLevelBindings(model, diagnostics)
  return diagnostics
}

/**
 * SR-092: warn when a factor declares the mask sentinel level but no
 * constraint ever pins the factor to it. A mask level that no constraint
 * can activate is almost always an authoring oversight — generated test
 * cases will silently omit the masked situation.
 *
 * "Pinned" means the factor appears in a positive equality comparison or
 * an IN clause whose value set includes the sentinel, anywhere in any
 * constraint (condition or consequent — having it referenced at all is
 * enough to suggest the author has wired the state in). Severity is
 * warning (not error): PICT generation must remain unblocked.
 */
function validateMaskLevelBindings(
  model: Model,
  out: Diagnostic[],
): void {
  const factorsWithMask = model.parameters.filter(p =>
    p.levels.some(isMaskLevelNode),
  )
  if (factorsWithMask.length === 0) return

  const boundFactors = new Set<string>()
  for (const c of model.constraints) {
    walkConstraintPredicates(c, predicate => {
      if (
        predicate.type === 'comparison' &&
        predicate.op === '=' &&
        (predicate.right.type === 'string' || predicate.right.type === 'identifier') &&
        predicate.right.value === MASK_LEVEL
      ) {
        boundFactors.add(predicate.left.name)
      } else if (predicate.type === 'in') {
        const includesMask = predicate.values.some(
          v =>
            (v.type === 'string' || v.type === 'identifier') &&
            v.value === MASK_LEVEL,
        )
        if (includesMask) boundFactors.add(predicate.left.name)
      }
    })
  }

  for (const factor of factorsWithMask) {
    if (boundFactors.has(factor.name)) continue
    const maskNode = factor.levels.find(isMaskLevelNode)!
    out.push({
      severity: 'warning',
      kind: 'unbound-mask-level',
      message:
        `因子 [${factor.name}] に設定された _MASK_ 水準に対する制約式が` +
        `定義されていないか、または不備があります。` +
        `どういう条件で _MASK_ 水準になるか、そしてそれ以外の時には ` +
        `_MASK_ 水準になってはいけないという制約関係が必要なはずです。`,
      range: maskNode.range,
    })
  }
}

function walkConstraintPredicates(
  c: ConstraintNode,
  visit: (p: Predicate) => void,
): void {
  if (c.type === 'if') {
    walkPredicate(c.condition, visit)
    walkPredicate(c.then, visit)
    if (c.else) walkPredicate(c.else, visit)
  } else {
    walkPredicate(c.predicate, visit)
  }
}

function walkPredicate(p: Predicate, visit: (p: Predicate) => void): void {
  visit(p)
  switch (p.type) {
    case 'and':
    case 'or':
      walkPredicate(p.left, visit)
      walkPredicate(p.right, visit)
      return
    case 'not':
      walkPredicate(p.operand, visit)
      return
  }
}

function validateComparison(
  cmp: Comparison,
  factors: Map<string, ParameterDecl>,
  out: Diagnostic[],
): void {
  const lhs = factors.get(cmp.left.name)
  if (!lhs) {
    out.push(unknownParameterDiagnostic(cmp.left))
    return
  }
  if (cmp.right.type === 'paramRef') {
    if (!factors.has(cmp.right.name)) {
      out.push(unknownParameterDiagnostic(cmp.right))
    }
    return
  }
  // Literal value. Only the equality / inequality operators are meaningful
  // checks against the declared level set: ordering operators (`<` etc.)
  // may legitimately compare a numeric factor to an out-of-set number, and
  // PICT itself permits this. Restrict the check accordingly.
  if (cmp.op !== '=' && cmp.op !== '<>') return
  if (!literalIsDeclaredLevel(lhs, cmp.right)) {
    out.push(unknownLevelDiagnostic(lhs, cmp.right))
  }
}

function validateInClause(
  inc: InClause,
  factors: Map<string, ParameterDecl>,
  out: Diagnostic[],
): void {
  const lhs = factors.get(inc.left.name)
  if (!lhs) {
    out.push(unknownParameterDiagnostic(inc.left))
    return
  }
  for (const v of inc.values) {
    if (!literalIsDeclaredLevel(lhs, v)) {
      out.push(unknownLevelDiagnostic(lhs, v))
    }
  }
}

function literalIsDeclaredLevel(
  factor: ParameterDecl,
  literal: ValueLiteral,
): boolean {
  // Compare the literal's `value` against each declared level's value
  // using string equality, since PICT level names are case-sensitive
  // strings even when their underlying type is numeric.
  const target = String(literal.value)
  for (const lv of factor.levels) {
    if (String(lv.value) === target) return true
  }
  return false
}

function unknownParameterDiagnostic(ref: ParameterRef): Diagnostic {
  return {
    severity: 'error',
    kind: 'unknown-parameter',
    message: `Parameter [${ref.name}] is not declared`,
    range: ref.range,
  }
}

function unknownLevelDiagnostic(
  factor: ParameterDecl,
  literal: ValueLiteral,
): Diagnostic {
  const declared = factor.levels.map(lv => String(lv.value)).join(', ')
  return {
    severity: 'error',
    kind: 'unknown-level',
    message:
      `Level "${String(literal.value)}" is not declared on factor ` +
      `[${factor.name}] (declared: ${declared})`,
    range: literal.range,
  }
}
