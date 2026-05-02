// Public API for the NeoCombi DSL engine.
// See Doc/DSL_Grammar_Specification.md for the formal grammar (PICT BNF MVP subset).

export { lex } from './lexer'
export type { Token, TokenKind } from './lexer'
export { parse } from './parser'
export {
  buildTypeInfo,
  evalPredicate,
  isConstraintSatisfied,
  isAssignmentValid,
  isPartiallyForbidden,
  computeForbiddenSlice,
  DEFAULT_ENUMERATION_LIMIT,
} from './evaluator'
export type {
  Model,
  ParameterDecl,
  LevelNode,
  StringLevel,
  NumberLevel,
  IdentifierLevel,
  ConstraintNode,
  IfStatement,
  UnconditionalConstraint,
  Predicate,
  OrExpr,
  AndExpr,
  NotExpr,
  Comparison,
  InClause,
  ParameterRef,
  ValueLiteral,
  ValueOrRef,
  CompareOp,
  Diagnostic,
  DiagnosticKind,
  DiagnosticSeverity,
  ParseResult,
  Position,
  Range,
  Assignment,
  LevelValue,
  FactorType,
  FactorTypeInfo,
  ModelTypeInfo,
  ForbiddenSliceCell,
  ForbiddenSliceResult,
  EvaluationOutcome,
  EvaluationFailureReason,
} from '../../types/dsl'
