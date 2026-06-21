import { describe, it, expect } from 'vitest'
import { parseCsv } from '../../src/services/csvImport'

describe('parseCsv', () => {
  it('parses a NeoCombi export (ID, Count, factors, Notes) without treating them as factors', () => {
    const text =
      'ID,Count,OS,Browser,Notes\n' +
      'P1,true,Linux,Chrome,Renders OK\n' +
      'P2,false,Windows,Safari,\n'
    const { suite } = parseCsv(text)
    expect(suite.factorOrder).toEqual(['OS', 'Browser'])
    expect(suite.rows).toHaveLength(2)
    expect(suite.rows[0]?.values).toEqual({ OS: 'Linux', Browser: 'Chrome' })
    expect(suite.rows[0]?.note).toBe('Renders OK')
    expect(suite.rows[0]?.count).toBe(true)
    expect(suite.rows[1]?.count).toBe(false)
    expect(suite.rows[1]?.note).toBeUndefined()
  })

  it('handles CSV without a Notes column', () => {
    const text = 'OS,Browser\nLinux,Chrome\n'
    const { suite } = parseCsv(text)
    expect(suite.factorOrder).toEqual(['OS', 'Browser'])
    expect(suite.rows[0]?.note).toBeUndefined()
  })

  it('decodes RFC 4180 escapes (commas, quotes, newlines)', () => {
    const text =
      'A,Notes\n' +
      '"a,b","has ""quote""\\nand newline"\n'
    const { suite } = parseCsv(text)
    expect(suite.rows[0]?.values['A']).toBe('a,b')
  })

  it('matches the legacy Expected column header case-insensitively as Notes', () => {
    const text = 'A,EXPECTED\nx,hello\n'
    const { suite } = parseCsv(text)
    expect(suite.rows[0]?.note).toBe('hello')
  })

  it('skips blank lines silently', () => {
    const text = 'A\n\nx\n\n'
    const { suite } = parseCsv(text)
    expect(suite.rows).toHaveLength(1)
  })

  it('returns an empty suite for empty input', () => {
    const { suite } = parseCsv('')
    expect(suite.factorOrder).toEqual([])
    expect(suite.rows).toEqual([])
  })

  it('auto-detects TSV when the first non-blank line has tabs and no commas', () => {
    const text = 'OS\tBrowser\nLinux\tChrome\nWindows\tSafari\n'
    const { suite, separator } = parseCsv(text)
    expect(separator).toBe('\t')
    expect(suite.factorOrder).toEqual(['OS', 'Browser'])
    expect(suite.rows).toHaveLength(2)
    expect(suite.rows[0]?.values).toEqual({ OS: 'Linux', Browser: 'Chrome' })
  })

  it('treats input with both tabs and commas as CSV', () => {
    const text = 'OS,Browser\nLinux,"a\tb"\n'
    const { separator } = parseCsv(text)
    expect(separator).toBe(',')
  })
})
