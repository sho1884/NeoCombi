import { describe, it, expect } from 'vitest'
import { lex } from '../../src/engines/dsl/lexer'
import type { Token, TokenKind } from '../../src/engines/dsl/lexer'

function kinds(tokens: Token[]): TokenKind[] {
  return tokens.map(t => t.kind)
}

function texts(tokens: Token[]): string[] {
  return tokens.map(t => t.text)
}

describe('lexer / whitespace and comments', () => {
  it('skips spaces and tabs but emits newlines', () => {
    const tokens = lex('  \t  \n')
    expect(kinds(tokens)).toEqual(['newline', 'eof'])
  })

  it('treats # comments as whitespace up to end of line', () => {
    const tokens = lex('# this is a comment\nIF')
    expect(kinds(tokens)).toEqual(['newline', 'kw_if', 'eof'])
  })

  it('keeps mid-line comment without consuming the newline that follows', () => {
    const tokens = lex('OS:Linux  # trailing\nBrowser:Chrome')
    // Expect: identifier(OS), colon, identifier(Linux), newline, identifier(Browser), colon, identifier(Chrome), eof
    expect(kinds(tokens)).toEqual([
      'identifier', 'colon', 'identifier',
      'newline',
      'identifier', 'colon', 'identifier',
      'eof',
    ])
  })
})

describe('lexer / keywords are case-insensitive', () => {
  it.each([
    ['IF', 'kw_if'],
    ['if', 'kw_if'],
    ['If', 'kw_if'],
    ['THEN', 'kw_then'],
    ['ELSE', 'kw_else'],
    ['AND', 'kw_and'],
    ['OR', 'kw_or'],
    ['NOT', 'kw_not'],
    ['IN', 'kw_in'],
    ['LIKE', 'kw_like'],
    ['like', 'kw_like'],
  ])('%s → %s', (input, expected) => {
    const tokens = lex(input)
    expect(tokens[0]?.kind).toBe(expected)
  })

  it('does not match keyword inside a longer identifier', () => {
    const tokens = lex('IFXYZ')
    expect(tokens[0]?.kind).toBe('identifier')
    expect(tokens[0]?.text).toBe('IFXYZ')
  })
})

describe('lexer / identifiers', () => {
  it('accepts ASCII identifiers', () => {
    const tokens = lex('OS')
    expect(tokens[0]?.kind).toBe('identifier')
    expect(tokens[0]?.text).toBe('OS')
  })

  it('lexes each whitespace-separated word as its own identifier (parser reassembles multi-word names in context)', () => {
    const tokens = lex('OS Version : Linux')
    expect(kinds(tokens)).toEqual(['identifier', 'identifier', 'colon', 'identifier', 'eof'])
    expect(tokens.slice(0, 4).map(t => t.text)).toEqual(['OS', 'Version', ':', 'Linux'])
  })

  it('accepts non-ASCII letters', () => {
    const tokens = lex('オペレーティングシステム')
    expect(tokens[0]?.kind).toBe('identifier')
    expect(tokens[0]?.text).toBe('オペレーティングシステム')
  })
})

describe('lexer / strings and numbers', () => {
  it('parses simple string literal', () => {
    const tokens = lex('"hello"')
    expect(tokens[0]?.kind).toBe('string')
    expect(tokens[0]?.value).toBe('hello')
  })

  it('handles escape sequences \\\\, \\", \\n, \\t', () => {
    const tokens = lex('"a\\\\b\\"c\\nd\\te"')
    expect(tokens[0]?.value).toBe('a\\b"c\nd\te')
  })

  it('parses positive integer and decimal numbers', () => {
    expect(lex('42')[0]?.value).toBe(42)
    expect(lex('3.14')[0]?.value).toBeCloseTo(3.14)
  })

  it('parses negative number after relation operator', () => {
    const tokens = lex('= -5')
    expect(kinds(tokens.slice(0, 2))).toEqual(['eq', 'number'])
    expect(tokens[1]?.value).toBe(-5)
  })

  it('lexes -5 in value position (after a relation operator) as a single negative number', () => {
    const tokens = lex('IF [A] = -5')
    const lastNum = tokens.find(t => t.kind === 'number')
    expect(lastNum?.value).toBe(-5)
  })

  it('does not glue - to a digit when the previous token is a value (avoids consuming binary minus)', () => {
    // After a number (a value), a stray '-' is not in value position;
    // it surfaces as 'unknown' so the parser can report a clear error.
    const tokens = lex('5 - 3')
    expect(tokens.map(t => t.kind)).toEqual(['number', 'unknown', 'number', 'eof'])
  })
})

describe('lexer / punctuation and operators', () => {
  it('emits each punctuation token', () => {
    const tokens = lex(':,;{}[]()')
    expect(kinds(tokens.slice(0, -1))).toEqual([
      'colon', 'comma', 'semicolon',
      'lbrace', 'rbrace',
      'lbracket', 'rbracket',
      'lparen', 'rparen',
    ])
  })

  it('emits relation operators', () => {
    const tokens = lex('= <> > >= < <=')
    expect(kinds(tokens.slice(0, -1))).toEqual([
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    ])
  })

  it('emits ~ @ as their own tokens (parser will report unsupported-mvp)', () => {
    const tokens = lex('~ @')
    expect(kinds(tokens.slice(0, -1))).toEqual(['tilde', 'at'])
  })
})

describe('lexer / positions', () => {
  it('tracks line and column across newlines', () => {
    const tokens = lex('OS\nBrowser')
    expect(tokens[0]?.range.start).toEqual({ line: 1, column: 1, offset: 0 })
    expect(tokens[2]?.range.start.line).toBe(2)
    expect(tokens[2]?.range.start.column).toBe(1)
  })

  it('records the EOF token at the end-of-source position', () => {
    const tokens = lex('A')
    const eof = tokens[tokens.length - 1]
    expect(eof?.kind).toBe('eof')
    expect(eof?.range.start.offset).toBe(1)
  })
})

describe('lexer / unknown chars are surfaced not silently dropped', () => {
  it('emits an unknown token for stray chars', () => {
    const tokens = lex('OS $ Linux')
    const unknown = tokens.find(t => t.kind === 'unknown')
    expect(unknown).toBeDefined()
    expect(unknown?.text).toBe('$')
  })
})

describe('lexer / token text round-trip for identifiers', () => {
  it('lexes consecutive words as separate identifiers (multi-word names are joined by the parser, not the lexer)', () => {
    const tokens = lex('  OS Major Version  : Linux')
    expect(texts(tokens.slice(0, -1))).toEqual([
      'OS', 'Major', 'Version', ':', 'Linux',
    ])
  })
})
