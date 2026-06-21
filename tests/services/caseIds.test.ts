import { describe, it, expect } from 'vitest'
import { assignCaseIds, suiteHasAnnotations } from '../../src/services/caseIds'
import type { TestSuite } from '../../src/types/testCase'

describe('assignCaseIds', () => {
  it('assigns P-IDs zero-padded to the case-count width (pairwise)', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: Array.from({ length: 11 }, (_, i) => ({ values: { A: `v${i}` } })),
    }
    const out = assignCaseIds(suite, 'pairwise')
    expect(out.rows[0]?.id).toBe('P01')
    expect(out.rows[10]?.id).toBe('P11')
    expect(out.rows.every(r => r.count === true)).toBe(true)
  })

  it('uses a single-digit width when there are fewer than ten cases', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: [{ values: { A: '1' } }, { values: { A: '2' } }],
    }
    const out = assignCaseIds(suite, 'pairwise')
    expect(out.rows.map(r => r.id)).toEqual(['P1', 'P2'])
  })

  it('numbers decision-table cases (D), skipping forbidden rows', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: [
        { values: { A: '1' }, forbidden: false },
        { values: { A: '2' }, forbidden: true },
        { values: { A: '3' }, forbidden: false },
      ],
    }
    const out = assignCaseIds(suite, 'decision-table')
    expect(out.rows[0]?.id).toBe('D1')
    expect(out.rows[0]?.count).toBe(true)
    // Forbidden row is not a test case: no ID, no count flag.
    expect(out.rows[1]?.id).toBeUndefined()
    expect(out.rows[1]?.count).toBeUndefined()
    expect(out.rows[1]?.forbidden).toBe(true)
    expect(out.rows[2]?.id).toBe('D2')
  })

  it('preserves an existing count flag and note', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: [{ values: { A: '1' }, count: false, note: 'memo' }],
    }
    const out = assignCaseIds(suite, 'pairwise')
    expect(out.rows[0]).toMatchObject({ id: 'P1', count: false, note: 'memo' })
  })
})

describe('suiteHasAnnotations', () => {
  it('is false for a null or freshly generated suite', () => {
    expect(suiteHasAnnotations(null)).toBe(false)
    expect(
      suiteHasAnnotations({
        factorOrder: ['A'],
        rows: [{ values: { A: '1' }, id: 'P1', count: true }],
      }),
    ).toBe(false)
  })

  it('is true when any case is flagged out or carries a note', () => {
    expect(
      suiteHasAnnotations({
        factorOrder: ['A'],
        rows: [{ values: { A: '1' }, id: 'P1', count: false }],
      }),
    ).toBe(true)
    expect(
      suiteHasAnnotations({
        factorOrder: ['A'],
        rows: [{ values: { A: '1' }, id: 'P1', count: true, note: 'x' }],
      }),
    ).toBe(true)
  })
})
