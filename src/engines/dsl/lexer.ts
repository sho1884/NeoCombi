import type { Position, Range } from '../../types/dsl'

export type TokenKind =
  | 'identifier'
  | 'string'
  | 'number'
  | 'colon'
  | 'comma'
  | 'semicolon'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'lparen'
  | 'rparen'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'newline'
  | 'kw_if'
  | 'kw_then'
  | 'kw_else'
  | 'kw_and'
  | 'kw_or'
  | 'kw_not'
  | 'kw_in'
  // MVP-unsupported tokens (parser will report 'unsupported-mvp' diagnostics):
  | 'kw_like'
  | 'tilde'
  | 'at'
  | 'eof'
  | 'unknown'

export type Token = {
  kind: TokenKind
  /** Source text the token covers. */
  text: string
  /** Parsed value for string / number literals. */
  value?: string | number
  range: Range
}

const KEYWORDS: Record<string, TokenKind> = {
  IF: 'kw_if',
  THEN: 'kw_then',
  ELSE: 'kw_else',
  AND: 'kw_and',
  OR: 'kw_or',
  NOT: 'kw_not',
  IN: 'kw_in',
  LIKE: 'kw_like',
}

/**
 * Tokenize PICT-DSL source. Comments and inter-token whitespace are skipped,
 * except newlines, which the parser uses to terminate parameter declarations.
 *
 * Identifiers may contain internal spaces (PICT compatibility); leading and
 * trailing spaces are not part of the identifier.
 */
export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let line = 1
  let lineStart = 0
  let i = 0

  const here = (): Position => ({
    line,
    column: i - lineStart + 1,
    offset: i,
  })

  const peek = (offset = 0): string => source[i + offset] ?? ''

  while (i < source.length) {
    const ch = source[i]!

    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }

    if (ch === '\r' || ch === '\n') {
      const start = here()
      if (ch === '\r' && peek(1) === '\n') {
        i += 2
      } else {
        i++
      }
      const end = here()
      tokens.push({
        kind: 'newline',
        text: source.slice(start.offset, i),
        range: { start, end },
      })
      line++
      lineStart = i
      continue
    }

    // Comment: '#' to end-of-line (newline itself is emitted separately).
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
        i++
      }
      continue
    }

    // String literal
    if (ch === '"') {
      const start = here()
      i++ // opening quote
      let value = ''
      while (i < source.length && source[i] !== '"') {
        const c = source[i]!
        if (c === '\\' && i + 1 < source.length) {
          const next = source[i + 1]!
          if (next === '\\') {
            value += '\\'
            i += 2
          } else if (next === '"') {
            value += '"'
            i += 2
          } else if (next === 'n') {
            value += '\n'
            i += 2
          } else if (next === 't') {
            value += '\t'
            i += 2
          } else {
            // Unknown escape — keep the backslash literally.
            value += c
            i++
          }
        } else if (c === '\n' || c === '\r') {
          // Unterminated string at end of line; stop scanning the literal here.
          break
        } else {
          value += c
          i++
        }
      }
      if (i < source.length && source[i] === '"') {
        i++ // closing quote
      }
      const end = here()
      tokens.push({
        kind: 'string',
        text: source.slice(start.offset, i),
        value,
        range: { start, end },
      })
      continue
    }

    // Number literal: digit-leading.
    if (isDigit(ch)) {
      const start = here()
      while (i < source.length && isDigit(source[i]!)) i++
      if (source[i] === '.' && isDigit(peek(1))) {
        i++
        while (i < source.length && isDigit(source[i]!)) i++
      }
      const end = here()
      const text = source.slice(start.offset, i)
      tokens.push({
        kind: 'number',
        text,
        value: Number(text),
        range: { start, end },
      })
      continue
    }

    // Negative number (only after value-position context tokens).
    if (ch === '-' && isDigit(peek(1)) && canStartValue(tokens)) {
      const start = here()
      i++
      while (i < source.length && isDigit(source[i]!)) i++
      if (source[i] === '.' && isDigit(peek(1))) {
        i++
        while (i < source.length && isDigit(source[i]!)) i++
      }
      const end = here()
      const text = source.slice(start.offset, i)
      tokens.push({
        kind: 'number',
        text,
        value: Number(text),
        range: { start, end },
      })
      continue
    }

    // Punctuation / operators
    const startPos = here()
    if (ch === ':') {
      i++
      tokens.push({ kind: 'colon', text: ':', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === ',') {
      i++
      tokens.push({ kind: 'comma', text: ',', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === ';') {
      i++
      tokens.push({ kind: 'semicolon', text: ';', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '{') {
      i++
      tokens.push({ kind: 'lbrace', text: '{', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '}') {
      i++
      tokens.push({ kind: 'rbrace', text: '}', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '[') {
      i++
      tokens.push({ kind: 'lbracket', text: '[', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === ']') {
      i++
      tokens.push({ kind: 'rbracket', text: ']', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '(') {
      i++
      tokens.push({ kind: 'lparen', text: '(', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === ')') {
      i++
      tokens.push({ kind: 'rparen', text: ')', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '=') {
      i++
      tokens.push({ kind: 'eq', text: '=', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '~') {
      i++
      tokens.push({ kind: 'tilde', text: '~', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '@') {
      i++
      tokens.push({ kind: 'at', text: '@', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '<') {
      if (peek(1) === '=') {
        i += 2
        tokens.push({ kind: 'lte', text: '<=', range: { start: startPos, end: here() } })
        continue
      }
      if (peek(1) === '>') {
        i += 2
        tokens.push({ kind: 'neq', text: '<>', range: { start: startPos, end: here() } })
        continue
      }
      i++
      tokens.push({ kind: 'lt', text: '<', range: { start: startPos, end: here() } })
      continue
    }
    if (ch === '>') {
      if (peek(1) === '=') {
        i += 2
        tokens.push({ kind: 'gte', text: '>=', range: { start: startPos, end: here() } })
        continue
      }
      i++
      tokens.push({ kind: 'gt', text: '>', range: { start: startPos, end: here() } })
      continue
    }

    // Identifier (single word; no internal spaces — multi-word names are
    // reassembled by the parser in contexts where they are unambiguous,
    // namely parameter declarations and bracketed parameter refs).
    if (isIdHead(ch)) {
      const start = here()
      i++
      while (i < source.length && isIdMid(source[i]!)) i++
      const end = here()
      const text = source.slice(start.offset, i)
      const upper = text.toUpperCase()
      const kw = KEYWORDS[upper]
      if (kw !== undefined) {
        tokens.push({ kind: kw, text, range: { start, end } })
      } else {
        tokens.push({
          kind: 'identifier',
          text,
          value: text,
          range: { start, end },
        })
      }
      continue
    }

    // Unknown character: emit as 'unknown' so parser can report syntax error
    // with precise location, and keep advancing.
    const unkStart = here()
    i++
    tokens.push({
      kind: 'unknown',
      text: ch,
      range: { start: unkStart, end: here() },
    })
  }

  const eofPos = here()
  tokens.push({
    kind: 'eof',
    text: '',
    range: { start: eofPos, end: eofPos },
  })
  return tokens
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isIdHead(ch: string): boolean {
  if (!ch) return false
  return (
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= 'a' && ch <= 'z') ||
    ch === '_' ||
    ch.codePointAt(0)! > 0x7f
  )
}

function isIdMid(ch: string): boolean {
  if (!ch) return false
  return isIdHead(ch) || isDigit(ch)
}

function canStartValue(tokens: Token[]): boolean {
  // Disambiguate unary minus on numbers. A leading '-digit' is treated as a
  // negative number only when the previous token expects a value to follow
  // (e.g., after a relation operator, comma, opening brace, etc.).
  if (tokens.length === 0) return true
  const prev = tokens[tokens.length - 1]!
  switch (prev.kind) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'comma':
    case 'lbrace':
    case 'lparen':
    case 'colon':
    case 'kw_then':
    case 'kw_else':
    case 'kw_in':
    case 'newline':
      return true
    default:
      return false
  }
}
