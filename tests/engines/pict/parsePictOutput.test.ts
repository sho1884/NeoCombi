import { describe, it, expect } from 'vitest'
import { parsePictOutput } from '../../../src/engines/pict/parsePictOutput'

describe('parsePictOutput', () => {
  it('parses a typical PICT output (TSV with header + rows)', () => {
    const tsv =
      'OS\tBrowser\tMemory\n' +
      'Linux\tChrome\t8\n' +
      'Linux\tFirefox\t16\n' +
      'Windows\tChrome\t4\n'
    const suite = parsePictOutput(tsv)
    expect(suite.factorOrder).toEqual(['OS', 'Browser', 'Memory'])
    expect(suite.rows).toHaveLength(3)
    expect(suite.rows[0]?.values).toEqual({
      OS: 'Linux',
      Browser: 'Chrome',
      Memory: '8',
    })
  })

  it('returns an empty suite for empty input', () => {
    expect(parsePictOutput('')).toEqual({ factorOrder: [], rows: [] })
  })

  it('returns an empty rows array for header-only output', () => {
    const suite = parsePictOutput('A\tB\tC\n')
    expect(suite.factorOrder).toEqual(['A', 'B', 'C'])
    expect(suite.rows).toEqual([])
  })

  it('pads short rows with empty strings', () => {
    const suite = parsePictOutput('A\tB\tC\nX\tY\n')
    expect(suite.rows[0]?.values).toEqual({ A: 'X', B: 'Y', C: '' })
  })

  it('truncates extra columns in over-long rows', () => {
    const suite = parsePictOutput('A\tB\nX\tY\tZ\n')
    expect(suite.rows[0]?.values).toEqual({ A: 'X', B: 'Y' })
  })

  it('trims whitespace around header and cell values', () => {
    const suite = parsePictOutput(' A \t B \n  X  \t  Y  \n')
    expect(suite.factorOrder).toEqual(['A', 'B'])
    expect(suite.rows[0]?.values).toEqual({ A: 'X', B: 'Y' })
  })

  it('accepts CRLF line endings', () => {
    const suite = parsePictOutput('A\tB\r\nX\tY\r\n')
    expect(suite.factorOrder).toEqual(['A', 'B'])
    expect(suite.rows).toHaveLength(1)
  })
})
