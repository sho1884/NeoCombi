import { describe, it, expect } from 'vitest'
import { formatTestSuite } from '../../../src/engines/pict/formatTestCases'
import type { TestSuite } from '../../../src/types/testCase'

const SAMPLE: TestSuite = {
  factorOrder: ['OS', 'Browser'],
  rows: [
    { values: { OS: 'Linux', Browser: 'Chrome' }, expected: 'Renders OK' },
    { values: { OS: 'Windows', Browser: 'Safari' } },
  ],
}

describe('formatTestSuite / csv', () => {
  it('emits an Expected column even when no row has expected value', () => {
    const out = formatTestSuite(
      { factorOrder: ['A'], rows: [{ values: { A: 'x' } }] },
      'csv',
    )
    expect(out).toBe('A,Expected\nx,\n')
  })

  it('emits expected text in the last column', () => {
    expect(formatTestSuite(SAMPLE, 'csv')).toBe(
      'OS,Browser,Expected\n' +
        'Linux,Chrome,Renders OK\n' +
        'Windows,Safari,\n',
    )
  })

  it('quotes fields containing commas, quotes or newlines (RFC 4180)', () => {
    const suite: TestSuite = {
      factorOrder: ['A'],
      rows: [
        { values: { A: 'has, comma' }, expected: 'has "quote" and\nnewline' },
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
      'OS\tBrowser\tExpected\n' +
        'Linux\tChrome\tRenders OK\n' +
        'Windows\tSafari\t\n',
    )
  })
})

describe('formatTestSuite / json', () => {
  it('emits an array of objects keyed by factor name + Expected', () => {
    const out = formatTestSuite(SAMPLE, 'json')
    const parsed = JSON.parse(out) as Array<Record<string, string>>
    expect(parsed).toEqual([
      { OS: 'Linux', Browser: 'Chrome', Expected: 'Renders OK' },
      { OS: 'Windows', Browser: 'Safari' },
    ])
  })
})
