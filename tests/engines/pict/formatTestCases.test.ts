import { describe, it, expect } from 'vitest'
import { formatTestSuite } from '../../../src/engines/pict/formatTestCases'
import type { TestSuite } from '../../../src/types/testCase'

// Column layout (UR-010 / SR-053): ID, Count, <factors...>, Notes.
const SAMPLE: TestSuite = {
  factorOrder: ['OS', 'Browser'],
  rows: [
    { id: 'P1', count: true, values: { OS: 'Linux', Browser: 'Chrome' }, note: 'Renders OK' },
    { id: 'P2', count: false, values: { OS: 'Windows', Browser: 'Safari' } },
  ],
}

describe('formatTestSuite / csv', () => {
  it('emits ID + Count + Notes columns even when no row has a note', () => {
    const out = formatTestSuite(
      { factorOrder: ['A'], rows: [{ id: 'P1', count: true, values: { A: 'x' } }] },
      'csv',
    )
    expect(out).toBe('ID,Count,A,Notes\nP1,true,x,\n')
  })

  it('emits the note text in the last column and the count flag as true/false', () => {
    expect(formatTestSuite(SAMPLE, 'csv')).toBe(
      'ID,Count,OS,Browser,Notes\n' +
        'P1,true,Linux,Chrome,Renders OK\n' +
        'P2,false,Windows,Safari,\n',
    )
  })

  it('quotes fields containing commas, quotes or newlines (RFC 4180)', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: [
        { id: 'P1', count: true, values: { A: 'has, comma' }, note: 'has "quote" and\nnewline' },
      ],
    }
    const out = formatTestSuite(suite, 'csv')
    expect(out).toContain('"has, comma"')
    expect(out).toContain('"has ""quote"" and\nnewline"')
  })
})

describe('formatTestSuite / tsv', () => {
  it('emits tab-separated values without quoting', () => {
    const out = formatTestSuite(SAMPLE, 'tsv')
    expect(out).toBe(
      'ID\tCount\tOS\tBrowser\tNotes\n' +
        'P1\ttrue\tLinux\tChrome\tRenders OK\n' +
        'P2\tfalse\tWindows\tSafari\t\n',
    )
  })
})

describe('formatTestSuite / json', () => {
  it('emits an array of objects with id, count, factor names + note', () => {
    const out = formatTestSuite(SAMPLE, 'json')
    const parsed = JSON.parse(out) as Array<Record<string, string | boolean>>
    expect(parsed).toEqual([
      { id: 'P1', count: true, OS: 'Linux', Browser: 'Chrome', note: 'Renders OK' },
      { id: 'P2', count: false, OS: 'Windows', Browser: 'Safari' },
    ])
  })
})
