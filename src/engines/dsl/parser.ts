import type {
  CompareOp,
  Comparison,
  ConstraintNode,
  Diagnostic,
  DiagnosticKind,
  IfStatement,
  InClause,
  LevelNode,
  ParameterDecl,
  ParameterRef,
  ParseResult,
  Predicate,
  Range,
  UnconditionalConstraint,
  ValueLiteral,
  ValueOrRef,
} from '../../types/dsl'
import type { Token, TokenKind } from './lexer'
import { lex } from './lexer'

/**
 * Parse a NeoCombi DSL source string into a Model AST + diagnostics.
 * Errors do not throw — they are collected as diagnostics and the parser
 * recovers to continue producing as much of the AST as possible.
 */
export function parse(source: string): ParseResult {
  const tokens = lex(source)
  const parser = new Parser(tokens)
  return parser.parse()
}

class Parser {
  private tokens: Token[]
  private pos: number
  private diagnostics: Diagnostic[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
    this.diagnostics = []
  }

  parse(): ParseResult {
    const parameters: ParameterDecl[] = []
    const constraints: ConstraintNode[] = []

    while (!this.atEnd()) {
      this.skipNewlines()
      if (this.atEnd()) break

      const t = this.peek()

      if (t.kind === 'identifier' && this.lookaheadHasColonBeforeNewline()) {
        const decl = this.parseParameterDecl()
        if (decl) parameters.push(decl)
        continue
      }

      if (
        t.kind === 'kw_if' ||
        t.kind === 'kw_not' ||
        t.kind === 'lbracket' ||
        t.kind === 'lparen'
      ) {
        const c = this.parseConstraint()
        if (c) constraints.push(c)
        continue
      }

      if (t.kind === 'lbrace') {
        this.report(
          'unsupported-mvp',
          "Submodel notation '{ ... } @ N' is not supported in MVP",
          t.range,
          'See DSL_Grammar_Specification.md §7.2',
        )
        this.skipToNextStatement()
        continue
      }

      if (t.kind === 'at') {
        this.report(
          'unsupported-mvp',
          "Submodel order operator '@' is not supported in MVP",
          t.range,
          'See DSL_Grammar_Specification.md §7.2',
        )
        this.skipToNextStatement()
        continue
      }

      if (t.kind === 'tilde') {
        this.report(
          'unsupported-mvp',
          "Negative value marker '~' is not supported in MVP",
          t.range,
          'See DSL_Grammar_Specification.md §7.2',
        )
        this.advance()
        continue
      }

      this.report(
        'syntax',
        `Unexpected ${describe(t)} at top level`,
        t.range,
      )
      this.advance()
    }

    return {
      model: { parameters, constraints },
      diagnostics: this.diagnostics,
    }
  }

  // ---------------------------------------------------------------------------
  // Parameter declarations
  // ---------------------------------------------------------------------------

  private parseParameterDecl(): ParameterDecl | null {
    const nameToken = this.expect('identifier', 'Expected parameter name')
    if (!nameToken) {
      this.skipToNextStatement()
      return null
    }
    // Reassemble multi-word names: consecutive identifier tokens before ':'
    // are joined with single spaces. This matches PICT compatibility for
    // names like `OS Version` while keeping the lexer free of context.
    let name = nameToken.text
    let nameEndRange = nameToken.range
    while (this.peek().kind === 'identifier') {
      const next = this.advance()
      name += ' ' + next.text
      nameEndRange = next.range
    }
    if (!this.expect('colon', "Expected ':' after parameter name")) {
      this.skipToNextStatement()
      return null
    }

    const levels: LevelNode[] = []
    const first = this.parseLevel()
    if (first) levels.push(first)
    while (this.match('comma')) {
      const lv = this.parseLevel()
      if (lv) levels.push(lv)
    }

    const lastRange =
      levels[levels.length - 1]?.range ?? nameToken.range

    const decl: ParameterDecl = {
      type: 'parameter',
      name,
      range: { start: nameToken.range.start, end: lastRange.end },
      nameRange: { start: nameToken.range.start, end: nameEndRange.end },
      levels,
    }

    // Consume trailing newline / EOF; report leftover tokens as syntax error.
    while (
      !this.atEnd() &&
      this.peek().kind !== 'newline' &&
      this.peek().kind !== 'eof'
    ) {
      const stray = this.advance()
      this.report(
        'syntax',
        `Unexpected ${describe(stray)} after parameter declaration`,
        stray.range,
      )
    }
    return decl
  }

  private parseLevel(): LevelNode | null {
    const t = this.peek()

    if (t.kind === 'tilde') {
      this.advance()
      this.report(
        'unsupported-mvp',
        "Negative value marker '~' is not supported in MVP",
        t.range,
        'See DSL_Grammar_Specification.md §7.2',
      )
      // Continue parsing the value that followed '~', for recovery.
      return this.parseLevel()
    }

    if (t.kind === 'string') {
      this.advance()
      return {
        type: 'string',
        value: typeof t.value === 'string' ? t.value : t.text,
        range: t.range,
      }
    }
    if (t.kind === 'number') {
      this.advance()
      return {
        type: 'number',
        value: typeof t.value === 'number' ? t.value : Number(t.text),
        raw: t.text,
        range: t.range,
      }
    }
    if (t.kind === 'identifier') {
      this.advance()
      // Detect weight: ' ( N ) ' immediately following the identifier.
      if (
        this.peek().kind === 'lparen' &&
        this.tokens[this.pos + 1]?.kind === 'number' &&
        this.tokens[this.pos + 2]?.kind === 'rparen'
      ) {
        const lp = this.advance()
        this.advance() // number
        const rp = this.advance()
        this.report(
          'unsupported-mvp',
          "Level weight '(N)' is not supported in MVP",
          { start: lp.range.start, end: rp.range.end },
          'See DSL_Grammar_Specification.md §7.2',
        )
      }
      return { type: 'identifier', value: t.text, range: t.range }
    }

    this.report(
      'syntax',
      `Expected level value, got ${describe(t)}`,
      t.range,
    )
    return null
  }

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  private parseConstraint(): ConstraintNode | null {
    const t = this.peek()
    if (t.kind === 'kw_if') {
      return this.parseIfStatement()
    }
    return this.parseUnconditionalConstraint()
  }

  private parseIfStatement(): IfStatement | null {
    const ifToken = this.expect('kw_if', 'Expected IF')
    if (!ifToken) return null

    const condition = this.parsePredicate()
    if (!this.expect('kw_then', 'Expected THEN')) {
      this.skipToNextStatement()
      return null
    }
    const thenBranch = this.parsePredicate()
    let elseBranch: Predicate | null = null
    if (this.match('kw_else')) {
      elseBranch = this.parsePredicate()
    }
    const semi = this.expect('semicolon', "Expected ';' to terminate IF / THEN constraint")
    const endRange = semi?.range ?? (elseBranch ?? thenBranch ?? condition)?.range ?? ifToken.range
    if (!condition || !thenBranch) {
      this.skipToNextStatement()
      return null
    }
    return {
      type: 'if',
      condition,
      then: thenBranch,
      else: elseBranch,
      range: { start: ifToken.range.start, end: endRange.end },
    }
  }

  private parseUnconditionalConstraint(): UnconditionalConstraint | null {
    const start = this.peek().range.start
    const predicate = this.parsePredicate()
    const semi = this.expect('semicolon', "Expected ';' to terminate constraint")
    const endRange = semi?.range ?? predicate?.range
    if (!predicate || !endRange) {
      this.skipToNextStatement()
      return null
    }
    return {
      type: 'unconditional',
      predicate,
      range: { start, end: endRange.end },
    }
  }

  // ---------------------------------------------------------------------------
  // Predicate (precedence: OR < AND < NOT < atomic)
  // ---------------------------------------------------------------------------

  private parsePredicate(): Predicate | null {
    return this.parseOrExpr()
  }

  private parseOrExpr(): Predicate | null {
    let left = this.parseAndExpr()
    while (left && this.peek().kind === 'kw_or') {
      this.advance()
      const right = this.parseAndExpr()
      if (!right) return left
      left = {
        type: 'or',
        left,
        right,
        range: { start: left.range.start, end: right.range.end },
      }
    }
    return left
  }

  private parseAndExpr(): Predicate | null {
    let left = this.parseNotExpr()
    while (left && this.peek().kind === 'kw_and') {
      this.advance()
      const right = this.parseNotExpr()
      if (!right) return left
      left = {
        type: 'and',
        left,
        right,
        range: { start: left.range.start, end: right.range.end },
      }
    }
    return left
  }

  private parseNotExpr(): Predicate | null {
    if (this.peek().kind === 'kw_not') {
      const notTok = this.advance()
      const operand = this.parseNotExpr()
      if (!operand) return null
      return {
        type: 'not',
        operand,
        range: { start: notTok.range.start, end: operand.range.end },
      }
    }
    return this.parseAtomicPredicate()
  }

  private parseAtomicPredicate(): Predicate | null {
    const t = this.peek()
    if (t.kind === 'lparen') {
      this.advance()
      const inner = this.parsePredicate()
      if (!this.expect('rparen', "Expected ')'")) {
        return inner
      }
      return inner
    }
    if (t.kind === 'lbracket') {
      return this.parseComparisonOrIn()
    }
    this.report(
      'syntax',
      `Expected predicate, got ${describe(t)}`,
      t.range,
    )
    this.advance()
    return null
  }

  private parseComparisonOrIn(): Comparison | InClause | null {
    const left = this.parseParameterRef()
    if (!left) return null

    const op = this.peek()
    if (op.kind === 'kw_in') {
      return this.parseInClauseRest(left)
    }
    if (op.kind === 'kw_like') {
      this.advance()
      this.report(
        'unsupported-mvp',
        "LIKE operator is not supported in MVP",
        op.range,
        'See DSL_Grammar_Specification.md §7.2',
      )
      // Consume the pattern operand for recovery.
      if (this.peek().kind === 'string' || this.peek().kind === 'identifier') {
        this.advance()
      }
      return null
    }
    const cmp = compareOpFromToken(op)
    if (cmp === null) {
      this.report(
        'syntax',
        `Expected relation operator, got ${describe(op)}`,
        op.range,
      )
      return null
    }
    this.advance()
    const right = this.parseValueOrRef()
    if (!right) return null
    return {
      type: 'comparison',
      left,
      op: cmp,
      right,
      range: { start: left.range.start, end: right.range.end },
    }
  }

  private parseInClauseRest(left: ParameterRef): InClause | null {
    this.expect('kw_in', 'Expected IN')
    if (!this.expect('lbrace', "Expected '{' after IN")) return null
    const values: ValueLiteral[] = []
    if (this.peek().kind !== 'rbrace') {
      const first = this.parseValueLiteral()
      if (first) values.push(first)
      while (this.match('comma')) {
        const v = this.parseValueLiteral()
        if (v) values.push(v)
      }
    }
    const close = this.expect('rbrace', "Expected '}' to close IN { ... }")
    if (!close) return null
    return {
      type: 'in',
      left,
      values,
      range: { start: left.range.start, end: close.range.end },
    }
  }

  private parseParameterRef(): ParameterRef | null {
    const lb = this.expect('lbracket', "Expected '['")
    if (!lb) return null
    const first = this.expect('identifier', "Expected parameter name inside '[ ]'")
    if (!first) return null
    // Reassemble multi-word names: identifiers between `[` and `]` are
    // joined with single spaces.
    let name = first.text
    while (this.peek().kind === 'identifier') {
      name += ' ' + this.advance().text
    }
    const rb = this.expect('rbracket', "Expected ']'")
    if (!rb) return null
    return {
      type: 'paramRef',
      name,
      range: { start: lb.range.start, end: rb.range.end },
    }
  }

  private parseValueOrRef(): ValueOrRef | null {
    if (this.peek().kind === 'lbracket') {
      return this.parseParameterRef()
    }
    return this.parseValueLiteral()
  }

  private parseValueLiteral(): ValueLiteral | null {
    const t = this.peek()
    if (t.kind === 'tilde') {
      this.advance()
      this.report(
        'unsupported-mvp',
        "Negative value marker '~' is not supported in MVP",
        t.range,
        'See DSL_Grammar_Specification.md §7.2',
      )
      return this.parseValueLiteral()
    }
    if (t.kind === 'string') {
      this.advance()
      return {
        type: 'string',
        value: typeof t.value === 'string' ? t.value : t.text,
        range: t.range,
      }
    }
    if (t.kind === 'number') {
      this.advance()
      return {
        type: 'number',
        value: typeof t.value === 'number' ? t.value : Number(t.text),
        raw: t.text,
        range: t.range,
      }
    }
    if (t.kind === 'identifier') {
      this.advance()
      return { type: 'identifier', value: t.text, range: t.range }
    }
    this.report(
      'syntax',
      `Expected value, got ${describe(t)}`,
      t.range,
    )
    return null
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1]!
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!
    if (this.pos < this.tokens.length - 1) this.pos++
    return t
  }

  private match(kind: TokenKind): boolean {
    if (this.peek().kind === kind) {
      this.advance()
      return true
    }
    return false
  }

  /** Expect a token kind. On match advance and return; otherwise emit syntax error and return null. */
  private expect(kind: TokenKind, message: string): Token | null {
    if (this.peek().kind === kind) {
      return this.advance()
    }
    const t = this.peek()
    this.report('syntax', `${message} (got ${describe(t)})`, t.range)
    return null
  }

  private report(
    kind: DiagnosticKind,
    message: string,
    range: Range,
    hint?: string,
  ): void {
    this.diagnostics.push({
      severity: 'error',
      kind,
      message,
      range,
      ...(hint !== undefined ? { hint } : {}),
    })
  }

  private atEnd(): boolean {
    return this.peek().kind === 'eof'
  }

  private skipNewlines(): void {
    while (this.peek().kind === 'newline') {
      this.advance()
    }
  }

  /** Skip until the next likely statement boundary (newline / `;` / EOF). */
  private skipToNextStatement(): void {
    while (
      !this.atEnd() &&
      this.peek().kind !== 'newline' &&
      this.peek().kind !== 'semicolon'
    ) {
      this.advance()
    }
    // Consume the boundary marker itself so the caller does not loop.
    if (this.peek().kind === 'newline' || this.peek().kind === 'semicolon') {
      this.advance()
    }
  }

  /**
   * Lookahead helper for the parameter / constraint section dispatch.
   * Returns true iff there is a `:` token before the next newline / EOF
   * (without consuming any tokens).
   */
  private lookaheadHasColonBeforeNewline(): boolean {
    let j = this.pos
    while (j < this.tokens.length) {
      const t = this.tokens[j]!
      if (t.kind === 'newline' || t.kind === 'eof') return false
      if (t.kind === 'colon') return true
      j++
    }
    return false
  }
}

function compareOpFromToken(t: Token): CompareOp | null {
  switch (t.kind) {
    case 'eq': return '='
    case 'neq': return '<>'
    case 'gt': return '>'
    case 'gte': return '>='
    case 'lt': return '<'
    case 'lte': return '<='
    default: return null
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case 'eof': return 'end of input'
    case 'newline': return 'newline'
    case 'identifier': return `identifier '${t.text}'`
    case 'string': return `string ${t.text}`
    case 'number': return `number ${t.text}`
    case 'unknown': return `unknown character '${t.text}'`
    default: return `'${t.text}'`
  }
}
