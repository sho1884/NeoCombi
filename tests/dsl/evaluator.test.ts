import { describe, it, expect } from 'vitest'
import { parse } from '../../src/engines/dsl/parser'
import {
  buildTypeInfo,
  evalPredicate,
  isAssignmentValid,
  isPartiallyForbidden,
  computeForbiddenSlice,
} from '../../src/engines/dsl/evaluator'
import type {
  Assignment,
  ForbiddenSliceCell,
  Model,
} from '../../src/types/dsl'

function modelOf(src: string): Model {
  const { model, diagnostics } = parse(src)
  if (diagnostics.length > 0) {
    throw new Error('Parse errors:\n' + diagnostics.map(d => d.message).join('\n'))
  }
  if (!model) throw new Error('No model')
  return model
}

function findCell(
  cells: ForbiddenSliceCell[],
  match: Assignment,
): ForbiddenSliceCell | undefined {
  return cells.find(c =>
    Object.keys(match).every(k => c.assignment[k] === match[k]),
  )
}

// =============================================================================

describe('evaluator / buildTypeInfo', () => {
  it('marks all-numeric parameter as numeric', () => {
    const m = modelOf('Memory: 4, 8, 16')
    const info = buildTypeInfo(m)
    expect(info.byName.get('Memory')?.type).toBe('numeric')
    expect(info.byName.get('Memory')?.levels).toEqual([4, 8, 16])
  })

  it('marks mixed-type or any-non-numeric parameter as string', () => {
    const m = modelOf('OS: Linux, Windows, macOS')
    const info = buildTypeInfo(m)
    expect(info.byName.get('OS')?.type).toBe('string')
    expect(info.byName.get('OS')?.levels).toEqual(['Linux', 'Windows', 'macOS'])
  })

  it('preserves declaration order in factors', () => {
    const m = modelOf('A: 1, 2\nB: x, y')
    const info = buildTypeInfo(m)
    expect(info.factors.map(f => f.name)).toEqual(['A', 'B'])
  })
})

describe('evaluator / evalPredicate', () => {
  it('evaluates equality and inequality', () => {
    const m = modelOf('OS: Linux, Windows\nIF [OS] = "Linux" THEN [OS] = "Linux";')
    const info = buildTypeInfo(m)
    const cmp = (m.constraints[0] as { type: 'if'; condition: import('../../src/types/dsl').Predicate }).condition
    expect(evalPredicate(cmp, { OS: 'Linux' }, info)).toBe(true)
    expect(evalPredicate(cmp, { OS: 'Windows' }, info)).toBe(false)
  })

  it('evaluates numeric comparisons', () => {
    const m = modelOf('Memory: 4, 8, 16\n[Memory] > 8;')
    const info = buildTypeInfo(m)
    const pred = (m.constraints[0] as { type: 'unconditional'; predicate: import('../../src/types/dsl').Predicate }).predicate
    expect(evalPredicate(pred, { Memory: 16 }, info)).toBe(true)
    expect(evalPredicate(pred, { Memory: 4 }, info)).toBe(false)
  })

  it('evaluates AND / OR / NOT with precedence (NOT > AND > OR)', () => {
    const m = modelOf(`
A: 0, 1
B: 0, 1
C: 0, 1
IF NOT [A] = 1 OR [B] = 1 AND [C] = 1 THEN [A] = 0;
    `)
    const info = buildTypeInfo(m)
    const cond = (m.constraints[0] as { type: 'if'; condition: import('../../src/types/dsl').Predicate }).condition
    // NOT [A]=1 OR ([B]=1 AND [C]=1)
    expect(evalPredicate(cond, { A: '0', B: '0', C: '0' }, info)).toBe(true)   // NOT (A=1) is true
    expect(evalPredicate(cond, { A: '1', B: '1', C: '1' }, info)).toBe(true)   // RHS B=1 AND C=1
    expect(evalPredicate(cond, { A: '1', B: '1', C: '0' }, info)).toBe(false)  // both false
  })

  it('evaluates IN clause', () => {
    const m = modelOf(`
OS: Linux, Windows, macOS, FreeBSD
[OS] IN { "Linux", "FreeBSD" };
    `)
    const info = buildTypeInfo(m)
    const pred = (m.constraints[0] as { type: 'unconditional'; predicate: import('../../src/types/dsl').Predicate }).predicate
    expect(evalPredicate(pred, { OS: 'Linux' }, info)).toBe(true)
    expect(evalPredicate(pred, { OS: 'FreeBSD' }, info)).toBe(true)
    expect(evalPredicate(pred, { OS: 'Windows' }, info)).toBe(false)
  })

  it('evaluates parameter-to-parameter comparison', () => {
    const m = modelOf(`
Min: 1, 2, 3
Max: 1, 2, 3
[Min] > [Max];
    `)
    const info = buildTypeInfo(m)
    const pred = (m.constraints[0] as { type: 'unconditional'; predicate: import('../../src/types/dsl').Predicate }).predicate
    expect(evalPredicate(pred, { Min: 3, Max: 1 }, info)).toBe(true)
    expect(evalPredicate(pred, { Min: 1, Max: 3 }, info)).toBe(false)
  })

  it('returns false on missing factor in the assignment (cannot decide true)', () => {
    const m = modelOf('OS: Linux, Windows\n[OS] = "Linux";')
    const info = buildTypeInfo(m)
    const pred = (m.constraints[0] as { type: 'unconditional'; predicate: import('../../src/types/dsl').Predicate }).predicate
    expect(evalPredicate(pred, {}, info)).toBe(false)
  })
})

describe('evaluator / isConstraintSatisfied / isAssignmentValid', () => {
  it('IF with false condition and no ELSE is vacuously satisfied', () => {
    const m = modelOf(`
A: 0, 1
B: 0, 1
IF [A] = 1 THEN [B] = 1;
    `)
    const info = buildTypeInfo(m)
    expect(isAssignmentValid(m, { A: '0', B: '0' }, info)).toBe(true)
  })

  it('IF / THEN constraint correctly identifies violation', () => {
    const m = modelOf(`
OS: Linux, Windows
Browser: Chrome, Safari
IF [OS] = "Linux" THEN [Browser] <> "Safari";
    `)
    const info = buildTypeInfo(m)
    expect(isAssignmentValid(m, { OS: 'Linux', Browser: 'Safari' }, info)).toBe(false)
    expect(isAssignmentValid(m, { OS: 'Linux', Browser: 'Chrome' }, info)).toBe(true)
    expect(isAssignmentValid(m, { OS: 'Windows', Browser: 'Safari' }, info)).toBe(true)
  })

  it('IF / THEN / ELSE applies the ELSE branch when condition is false', () => {
    const m = modelOf(`
Auth: OAuth, None
HTTPS: Yes, No
IF [Auth] = "OAuth" THEN [HTTPS] = "Yes" ELSE [HTTPS] = "No";
    `)
    const info = buildTypeInfo(m)
    expect(isAssignmentValid(m, { Auth: 'OAuth', HTTPS: 'Yes' }, info)).toBe(true)
    expect(isAssignmentValid(m, { Auth: 'OAuth', HTTPS: 'No' }, info)).toBe(false)
    expect(isAssignmentValid(m, { Auth: 'None', HTTPS: 'No' }, info)).toBe(true)
    expect(isAssignmentValid(m, { Auth: 'None', HTTPS: 'Yes' }, info)).toBe(false)
  })
})

describe('evaluator / isPartiallyForbidden', () => {
  it('returns false (not forbidden) when the partial assignment can be extended', () => {
    const m = modelOf(`
OS: Linux, Windows
Browser: Chrome, Safari
IF [OS] = "Linux" THEN [Browser] <> "Safari";
    `)
    const info = buildTypeInfo(m)
    const r = isPartiallyForbidden(m, { OS: 'Linux' }, info)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(false) // Linux + Chrome is OK
  })

  it('returns true (forbidden) when no full extension can satisfy all constraints', () => {
    // Construct a model where (OS=Linux, Browser=Safari) is forbidden, then
    // ask if the partial { OS:Linux, Browser:Safari } is forbidden.
    const m = modelOf(`
OS: Linux, Windows
Browser: Chrome, Safari
IF [OS] = "Linux" THEN [Browser] <> "Safari";
    `)
    const info = buildTypeInfo(m)
    const r = isPartiallyForbidden(m, { OS: 'Linux', Browser: 'Safari' }, info)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(true)
  })

  it('errors with too-large when free-factor cardinality exceeds the limit', () => {
    const m = modelOf(`
A: 1, 2, 3, 4, 5
B: 1, 2, 3, 4, 5
C: 1, 2, 3, 4, 5
    `)
    const info = buildTypeInfo(m)
    const r = isPartiallyForbidden(m, {}, info, { limit: 50 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too-large')
  })

  it('errors with unknown-factor when the partial uses an unknown name', () => {
    const m = modelOf('OS: Linux, Windows')
    const info = buildTypeInfo(m)
    const r = isPartiallyForbidden(m, { Browser: 'Chrome' }, info)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown-factor')
  })
})

describe('evaluator / computeForbiddenSlice', () => {
  it('marks the directly-forbidden cell in a 2-factor slice', () => {
    const m = modelOf(`
OS: Linux, Windows
Browser: Chrome, Safari
IF [OS] = "Linux" THEN [Browser] <> "Safari";
    `)
    const result = computeForbiddenSlice(m, ['OS', 'Browser'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { cells } = result.value
    expect(cells).toHaveLength(4)
    expect(findCell(cells, { OS: 'Linux', Browser: 'Safari' })?.forbidden).toBe(true)
    expect(findCell(cells, { OS: 'Linux', Browser: 'Chrome' })?.forbidden).toBe(false)
    expect(findCell(cells, { OS: 'Windows', Browser: 'Safari' })?.forbidden).toBe(false)
    expect(findCell(cells, { OS: 'Windows', Browser: 'Chrome' })?.forbidden).toBe(false)
  })

  it('detects indirectly-forbidden combinations through a chain of constraints', () => {
    // Linux requires Browser=Chrome. Chrome requires Mode=Standard.
    // Therefore (Linux, Mode=Other) is forbidden through the chain even
    // without Browser appearing in the slice.
    const m = modelOf(`
OS: Linux, Windows
Browser: Chrome, Safari
Mode: Standard, Other
IF [OS] = "Linux" THEN [Browser] = "Chrome";
IF [Browser] = "Chrome" THEN [Mode] = "Standard";
    `)
    const result = computeForbiddenSlice(m, ['OS', 'Mode'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { cells } = result.value
    expect(findCell(cells, { OS: 'Linux', Mode: 'Other' })?.forbidden).toBe(true)
    expect(findCell(cells, { OS: 'Linux', Mode: 'Standard' })?.forbidden).toBe(false)
    expect(findCell(cells, { OS: 'Windows', Mode: 'Other' })?.forbidden).toBe(false)
  })

  it('handles a 3-factor slice', () => {
    const m = modelOf(`
A: 0, 1
B: 0, 1
C: 0, 1
IF [A] = 1 AND [B] = 1 THEN [C] = 1;
    `)
    const result = computeForbiddenSlice(m, ['A', 'B', 'C'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { cells } = result.value
    expect(cells).toHaveLength(8)
    // Factors A / B / C have numeric levels, so cells store number values.
    expect(findCell(cells, { A: 1, B: 1, C: 0 })?.forbidden).toBe(true)
    expect(findCell(cells, { A: 1, B: 1, C: 1 })?.forbidden).toBe(false)
  })

  it('errors with unknown-factor for a slice referencing a missing factor', () => {
    const m = modelOf('OS: Linux, Windows')
    const result = computeForbiddenSlice(m, ['OS', 'Browser'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown-factor')
  })

  it('preserves factor order in the result', () => {
    const m = modelOf('A: 1, 2\nB: x, y')
    const result = computeForbiddenSlice(m, ['B', 'A'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.factors).toEqual(['B', 'A'])
  })
})
