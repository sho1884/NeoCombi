import { describe, it, expect } from 'vitest'
import {
  formatDecisionTable,
  type DecisionTableOutRow,
} from '../../src/engines/dsl/formatDecisionTable'

// Column layout (UR-010 / SR-053): ID, Count, <factors...>, Forbidden, Notes.
// Forbidden rows are not test cases: no ID, no count flag.
const columns = ['Color', 'Size']
const rows: DecisionTableOutRow[] = [
  { id: 'D1', count: true, values: ['Red', 'S'], forbidden: false },
  { values: ['Red', 'L'], forbidden: true },
  { id: 'D2', count: false, values: ['Blue', 'M'], forbidden: false, note: 'ok' },
]

describe('formatDecisionTable', () => {
  it('CSV: header carries ID/Count/Forbidden/Notes; forbidden rows marked', () => {
    const csv = formatDecisionTable(columns, rows, 'csv')
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('ID,Count,Color,Size,Forbidden,Notes')
    expect(lines[1]).toBe('D1,true,Red,S,,')
    expect(lines[2]).toBe(',,Red,L,X,')
    expect(lines[3]).toBe('D2,false,Blue,M,,ok')
  })

  it('TSV uses tabs', () => {
    const tsv = formatDecisionTable(columns, rows, 'tsv')
    expect(tsv.split('\n')[2]).toBe('\t\tRed\tL\tX\t')
  })

  it('JSON: Forbidden is a boolean; id / count / note only when present', () => {
    const json = JSON.parse(formatDecisionTable(columns, rows, 'json'))
    expect(json[1]).toEqual({ Color: 'Red', Size: 'L', Forbidden: true })
    expect(json[2]).toEqual({
      id: 'D2',
      count: false,
      Color: 'Blue',
      Size: 'M',
      Forbidden: false,
      note: 'ok',
    })
  })

  it('CSV-escapes cells containing commas / quotes', () => {
    const csv = formatDecisionTable(
      ['A'],
      [{ id: 'D1', count: true, values: ['x,y'], forbidden: false, note: 'he said "hi"' }],
      'csv',
    )
    expect(csv.split('\n')[1]).toBe('D1,true,"x,y",,"he said ""hi"""')
  })
})
