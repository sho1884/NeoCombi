import { describe, it, expect } from 'vitest'
import { parse } from '../../src/engines/dsl/parser'
import {
  generateDecisionTable,
  DECISION_TABLE_LIMIT,
} from '../../src/engines/dsl/decisionTable'
import type { Model } from '../../src/types/dsl'

function modelOf(src: string): Model {
  const { model, diagnostics } = parse(src)
  if (diagnostics.some(d => d.severity === 'error')) {
    throw new Error('Parse errors:\n' + diagnostics.map(d => d.message).join('\n'))
  }
  if (!model) throw new Error('No model')
  return model
}

describe('decisionTable / generateDecisionTable', () => {
  it('emits the full Cartesian product in declared-factor order', () => {
    const result = generateDecisionTable(modelOf('Color: Red, Blue\nSize: S, M, L'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.columns).toEqual(['Color', 'Size'])
    // 2 x 3 = 6 rows, no constraints -> none forbidden.
    expect(result.rows).toHaveLength(6)
    expect(result.rows.every(r => !r.forbidden)).toBe(true)
    // Rightmost factor (Size) varies fastest.
    expect(result.rows.map(r => r.values)).toEqual([
      ['Red', 'S'],
      ['Red', 'M'],
      ['Red', 'L'],
      ['Blue', 'S'],
      ['Blue', 'M'],
      ['Blue', 'L'],
    ])
  })

  it('keeps forbidden rows and marks them (does not exclude)', () => {
    // "Red の L は作らない"
    const result = generateDecisionTable(
      modelOf('Color: Red, Blue\nSize: S, M, L\nIF [Color] = "Red" THEN [Size] <> "L";'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Still all 6 rows — forbidden rows are retained.
    expect(result.rows).toHaveLength(6)
    const redL = result.rows.find(r => r.values[0] === 'Red' && r.values[1] === 'L')
    expect(redL?.forbidden).toBe(true)
    // Every other row is allowed.
    const others = result.rows.filter(r => !(r.values[0] === 'Red' && r.values[1] === 'L'))
    expect(others.every(r => !r.forbidden)).toBe(true)
  })

  it('marks nothing forbidden when there are no constraints', () => {
    const result = generateDecisionTable(modelOf('A: 1, 2\nB: x, y'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(4)
    expect(result.rows.some(r => r.forbidden)).toBe(false)
  })

  it('refuses above the limit without enumerating (too-large)', () => {
    // 3 factors x 10 levels = 1000 > limit 512.
    const ten = Array.from({ length: 10 }, (_, i) => `v${i}`).join(', ')
    const result = generateDecisionTable(modelOf(`A: ${ten}\nB: ${ten}\nC: ${ten}`))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('too-large')
    if (result.reason !== 'too-large') return
    expect(result.count).toBe(1000)
    expect(result.limit).toBe(DECISION_TABLE_LIMIT)
  })

  it('honors a custom limit', () => {
    const result = generateDecisionTable(modelOf('A: 1, 2, 3\nB: a, b, c'), { limit: 8 })
    // 3 x 3 = 9 > 8
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('too-large')
  })

  it('allows a product exactly at the limit', () => {
    const result = generateDecisionTable(modelOf('A: 1, 2\nB: a, b'), { limit: 4 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(4)
  })

  it('returns invalid-model when there are no factors', () => {
    const result = generateDecisionTable({ parameters: [], constraints: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-model')
    if (result.reason !== 'invalid-model') return
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('renders numeric levels as their textual value', () => {
    const result = generateDecisionTable(modelOf('Mem: 4, 8'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows.map(r => r.values[0])).toEqual(['4', '8'])
  })
})
