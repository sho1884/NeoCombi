import { describe, it, expect } from 'vitest'
import {
  formatDecisionTable,
  type DecisionTableOutRow,
} from '../../src/engines/dsl/formatDecisionTable'

const columns = ['Color', 'Size']
const rows: DecisionTableOutRow[] = [
  { values: ['Red', 'S'], forbidden: false },
  { values: ['Red', 'L'], forbidden: true },
  { values: ['Blue', 'M'], forbidden: false, expected: 'ok' },
]

describe('formatDecisionTable', () => {
  it('CSV: header carries Forbidden + Expected; forbidden rows marked', () => {
    const csv = formatDecisionTable(columns, rows, 'csv')
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('Color,Size,Forbidden,Expected')
    expect(lines[1]).toBe('Red,S,,')
    expect(lines[2]).toBe('Red,L,x,')
    expect(lines[3]).toBe('Blue,M,,ok')
  })

  it('TSV uses tabs', () => {
    const tsv = formatDecisionTable(columns, rows, 'tsv')
    expect(tsv.split('\n')[2]).toBe('Red\tL\tx\t')
  })

  it('JSON: Forbidden is a boolean; Expected only when present', () => {
    const json = JSON.parse(formatDecisionTable(columns, rows, 'json'))
    expect(json[1]).toEqual({ Color: 'Red', Size: 'L', Forbidden: true })
    expect(json[2]).toEqual({ Color: 'Blue', Size: 'M', Forbidden: false, Expected: 'ok' })
  })

  it('CSV-escapes cells containing commas / quotes', () => {
    const csv = formatDecisionTable(
      ['A'],
      [{ values: ['x,y'], forbidden: false, expected: 'he said "hi"' }],
      'csv',
    )
    expect(csv.split('\n')[1]).toBe('"x,y",,"he said ""hi"""')
  })
})
