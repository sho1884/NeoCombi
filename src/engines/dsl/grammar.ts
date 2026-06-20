// The canonical NeoCombi DSL grammar (a strict subset of Microsoft PICT),
// exposed in the app so users can copy or download it — e.g. to hand to an AI
// assistant together with a test problem and have it generate the DSL.
// Mirrors Doc/DSL_Grammar_Specification.md §4 — keep the two in sync.

export const DSL_GRAMMAR_VERSION = '1.0'

// String.raw so the EBNF's backslash escapes (\r, \n, \\, \x..) stay literal.
export const DSL_GRAMMAR_EBNF = String.raw`(* NeoCombi DSL Grammar — Version 1.0
   A strict subset of Microsoft PICT's constraint language. DSL written against
   this grammar is also valid PICT input. *)

(* File structure *)
Model            ::= ParameterSection ConstraintSection?
ParameterSection ::= ( BlankOrComment | ParameterDecl )+
ConstraintSection
                 ::= ( BlankOrComment | Constraint )+
BlankOrComment   ::= EmptyLine | Comment
EmptyLine        ::= NewLine
Comment          ::= '#' CommentChar* NewLine
CommentChar      ::= [^\r\n]

(* Parameter section *)
ParameterDecl    ::= ParameterName ':' LevelList NewLine
ParameterName    ::= Identifier
LevelList        ::= Level ( ',' Level )*
Level            ::= Identifier | StringLiteral | NumberLiteral

(* Constraint section *)
Constraint       ::= ( IfStatement | UnconditionalConstraint ) ';'
IfStatement      ::= 'IF' Predicate 'THEN' Predicate ( 'ELSE' Predicate )?
UnconditionalConstraint
                 ::= Predicate
Predicate        ::= OrExpr
OrExpr           ::= AndExpr ( 'OR' AndExpr )*
AndExpr          ::= NotExpr ( 'AND' NotExpr )*
NotExpr          ::= 'NOT' NotExpr | AtomicPred
AtomicPred       ::= '(' Predicate ')' | Comparison | InClause
Comparison       ::= ParameterRef Relation ComparisonRhs
ComparisonRhs    ::= Value | ParameterRef
ParameterRef     ::= '[' ParameterName ']'
Relation         ::= '=' | '<>' | '>' | '>=' | '<' | '<='
InClause         ::= ParameterRef 'IN' '{' ValueList '}'
ValueList        ::= Value ( ',' Value )*

(* Values: a comparison right-hand side and IN { } members must be a quoted
   string or a number — a bare identifier is rejected (PICT rejects it too).
   A Level in a parameter declaration may be a bare identifier. *)
Value            ::= StringLiteral | NumberLiteral

(* Lexical primitives *)
Identifier       ::= IdHead ( IdMid* IdHead )?
IdHead           ::= Letter | Digit | '_' | NonAsciiLetter
IdMid            ::= IdHead | ' '
StringLiteral    ::= '"' StringChar* '"'
StringChar       ::= [^"\\] | EscapeSeq
EscapeSeq        ::= '\\' ( '\\' | '"' | 'n' | 't' )
NumberLiteral    ::= '-'? Digit+ ( '.' Digit+ )?
Letter           ::= [A-Za-z]
Digit            ::= [0-9]
NonAsciiLetter   ::= [^\x00-\x7F]    (* Unicode letter, simplified *)
NewLine          ::= '\r'? '\n' | '\r'

(* Operator precedence (high to low): NOT > AND > OR.
   Keywords (IF THEN ELSE AND OR NOT IN) are case-insensitive. *)
`
