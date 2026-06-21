import { describe, it, expect, beforeEach } from 'vitest'
import { parseResultsCsv, applyResultsCsv } from '../../src/services/resultsCsv'
import { useProjectStore } from '../../src/stores/projectStore'

beforeEach(() => {
  useProjectStore.getState().resetToEmpty()
})

describe('parseResultsCsv', () => {
  it('parses the three-column id,count,note format', () => {
    const { rows, warnings } = parseResultsCsv(
      'id,count,note\nP1,false,bug 123\nP2,true,\n',
    )
    expect(warnings).toEqual([])
    expect(rows).toEqual([
      { id: 'P1', count: false, note: 'bug 123' },
      { id: 'P2', count: true, note: '' },
    ])
  })

  it('rejects a header missing required columns', () => {
    const { rows, warnings } = parseResultsCsv('id,flag\nP1,true\n')
    expect(rows).toEqual([])
    expect(warnings[0]?.reason).toMatch(/id, count, and note/)
  })

  it('skips rows with empty id or invalid count, reporting each', () => {
    const { rows, warnings } = parseResultsCsv(
      'id,count,note\n,true,x\nP2,maybe,y\nP3,1,z\n',
    )
    expect(rows).toEqual([{ id: 'P3', count: true, note: 'z' }])
    expect(warnings).toHaveLength(2)
  })

  it('ignores a duplicate id (keeps the first) and reports it', () => {
    const { rows, warnings } = parseResultsCsv(
      'id,count,note\nP1,true,first\nP1,false,second\n',
    )
    expect(rows).toEqual([{ id: 'P1', count: true, note: 'first' }])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.reason).toMatch(/duplicate id/)
  })
})

describe('applyResultsCsv', () => {
  function seed() {
    useProjectStore.getState().setTestSuite({
      factorOrder: ['OS'],
      rows: [{ values: { OS: 'Linux' } }, { values: { OS: 'Windows' } }],
    })
    // IDs become P1, P2 (two cases -> single-digit width).
  }

  it('updates matching cases by ID and reports unmatched rows', () => {
    seed()
    const result = applyResultsCsv('id,count,note\nP1,false,failed\nP9,true,ghost\n')
    expect(result.matched).toBe(1)
    expect(result.unmatchedIds).toEqual(['P9'])
    const rows = useProjectStore.getState().testSuite!.rows
    expect(rows[0]).toMatchObject({ id: 'P1', count: false, note: 'failed' })
    // The untouched case keeps its defaults.
    expect(rows[1]).toMatchObject({ id: 'P2', count: true })
    expect(rows[1]?.note).toBeUndefined()
  })

  it('clears a note when the CSV note cell is empty', () => {
    useProjectStore.getState().setTestSuite({
      factorOrder: ['OS'],
      rows: [{ values: { OS: 'Linux' }, note: 'old' }],
    })
    applyResultsCsv('id,count,note\nP1,true,\n')
    expect(useProjectStore.getState().testSuite!.rows[0]?.note).toBeUndefined()
  })
})
