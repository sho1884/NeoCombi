import { describe, it, expect } from 'vitest'
import { parseCsv } from '../../src/services/csvImport'

describe('parseCsv', () => {
  it('parses a simple CSV produced by the CLI (header + Expected column)', () => {
    const text =
      'OS,Browser,Expected\n' +
      'Linux,Chrome,Renders OK\n' +
      'Windows,Safari,\n'
    const { suite } = parseCsv(text)
    expect(suite.factorOrder).toEqual(['OS', 'Browser'])
    expect(suite.rows).toHaveLength(2)
    expect(suite.rows[0]?.values).toEqual({ OS: 'Linux', Browser: 'Chrome' })
    expect(suite.rows[0]?.expected).toBe('Renders OK')
    expect(suite.rows[1]?.expected).toBeUndefined()
  })

  it('handles CSV without Expected column', () => {
    const text = 'OS,Browser\nLinux,Chrome\n'
    const { suite } = parseCsv(text)
    expect(suite.factorOrder).toEqual(['OS', 'Browser'])
    expect(suite.rows[0]?.expected).toBeUndefined()
  })

  it('decodes RFC 4180 escapes (commas, quotes, newlines)', () => {
    const text =
      'A,Expected\n' +
      '"a,b","has ""quote""\\nand newline"\n'
    const { suite } = parseCsv(text)
    expect(suite.rows[0]?.values['A']).toBe('a,b')
  })

  it('matches Expected column case-insensitively', () => {
    const text = 'A,EXPECTED\nx,hello\n'
    const { suite } = parseCsv(text)
    expect(suite.rows[0]?.expected).toBe('hello')
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
