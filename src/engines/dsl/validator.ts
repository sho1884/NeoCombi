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
  return diagnostics
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
