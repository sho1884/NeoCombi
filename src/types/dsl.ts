// AST node and diagnostic types for the NeoCombi DSL (PICT BNF MVP subset).
// See Doc/DSL_Grammar_Specification.md for the formal grammar.

/** 1-based line / column, 0-based byte offset into the source text. */
export type Position = {
  line: number
  column: number
  offset: number
}

export type Range = {
  start: Position
  end: Position
}

// =============================================================================
// AST nodes
// =============================================================================

export type Model = {
  parameters: ParameterDecl[]
  constraints: ConstraintNode[]
}

export type ParameterDecl = {
  type: 'parameter'
  name: string
  /** Range of the entire `Name : ...` declaration, ending at the trailing newline / EOF. */
  range: Range
  /** Range of just the parameter name token. */
  nameRange: Range
  levels: LevelNode[]
}

export type LevelNode = StringLevel | NumberLevel | IdentifierLevel

export type StringLevel = {
  type: 'string'
  value: string
  range: Range
}

export type NumberLevel = {
  type: 'number'
  value: number
  /** Original literal text (preserved for round-tripping). */
  raw: string
  range: Range
}

export type IdentifierLevel = {
  type: 'identifier'
  value: string
  range: Range
}

export type ConstraintNode = IfStatement | UnconditionalConstraint

export type IfStatement = {
  type: 'if'
  condition: Predicate
  then: Predicate
  else: Predicate | null
  range: Range
}

export type UnconditionalConstraint = {
  type: 'unconditional'
  predicate: Predicate
  range: Range
}

export type Predicate = OrExpr | AndExpr | NotExpr | Comparison | InClause

export type OrExpr = {
  type: 'or'
  left: Predicate
  right: Predicate
  range: Range
}

export type AndExpr = {
  type: 'and'
  left: Predicate
  right: Predicate
  range: Range
}

export type NotExpr = {
  type: 'not'
  operand: Predicate
  range: Range
}

export type CompareOp = '=' | '<>' | '>' | '>=' | '<' | '<='

export type Comparison = {
  type: 'comparison'
  left: ParameterRef
  op: CompareOp
  right: ValueOrRef
  range: Range
}

export type InClause = {
  type: 'in'
  left: ParameterRef
  values: ValueLiteral[]
  range: Range
}

export type ParameterRef = {
  type: 'paramRef'
  name: string
  range: Range
}

export type ValueLiteral = StringLevel | NumberLevel | IdentifierLevel
export type ValueOrRef = ValueLiteral | ParameterRef

// =============================================================================
// Diagnostics
// =============================================================================

export type DiagnosticSeverity = 'error' | 'warning'

export type DiagnosticKind =
  | 'syntax'
  | 'unsupported-mvp'
  | 'duplicate-parameter'
  | 'duplicate-level'
  | 'unknown-parameter'
  | 'unknown-level'
  | 'type-mismatch'

export type Diagnostic = {
  severity: DiagnosticSeverity
  kind: DiagnosticKind
  message: string
  range: Range
  /** Optional reference to a section of Doc/DSL_Grammar_Specification.md. */
  hint?: string
}

export type ParseResult = {
  /** AST root if anything usable was produced. May be present even with errors (recovery). */
  model: Model | null
  diagnostics: Diagnostic[]
}
