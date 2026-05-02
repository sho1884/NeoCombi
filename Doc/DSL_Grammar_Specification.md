# NeoCombi DSL Grammar Specification

> NeoCombi の制約 DSL の文法仕様。PICT 制約言語の最小サブセットを EBNF として独立定義し、PICT BNF からの差分（捨てた要素）を明示する。
>
> Status: draft (2026-05-02). MVP 対応範囲を定義する一次資料。
> Related: [ADR-001](adr/ADR-001-mirror-pict-bnf-subset.yaml), [ADR-005](adr/ADR-005-builtin-dsl-evaluator.yaml).

## 1. 目的とスコープ — Purpose & Scope

NeoCombi の DSL は以下の 2 つの役割を担う：

1. **PICT 入力の生成元** — DSL を PICT 入力形式に変換し、外部 CLI として呼び出してテストケースを生成する（[ADR-002](adr/ADR-002-invoke-pict-as-external-cli.yaml)）
2. **内製 DSL 評価器の入力** — DSL を NeoCombi 自身が評価し、N 因子禁則組合せをローカルで列挙する（[ADR-005](adr/ADR-005-builtin-dsl-evaluator.yaml)）

両用途で同じ DSL を使うため、文法は PICT BNF と意味的に一致しなければならない。本仕様は PICT BNF を 1:1 で mirror しつつ、MVP の対応範囲を最小サブセットに限定する（[ADR-001](adr/ADR-001-mirror-pict-bnf-subset.yaml)）。

The NeoCombi DSL is a strict subset of the PICT constraint language. It serves both as the input that gets passed to the external PICT CLI and as the input to NeoCombi's built-in evaluator that derives forbidden combination matrices without invoking PICT.

## 2. MVP 対応範囲 — MVP Coverage

### 2.1 採用する構文

- **パラメータ宣言**（因子・水準のリスト）
- **制約節**：`IF ... THEN ... [ELSE ...]` 形式、および無条件制約（`Predicate;`）
- **比較演算子**：`=`, `<>`, `>`, `>=`, `<`, `<=`
- **論理演算子**：`AND`, `OR`, `NOT`
- **集合包含**：`[Param] IN { v1, v2, ... }`
- **パラメータ参照**：`[ParameterName]`（角括弧で囲む）
- **括弧によるグループ化**：`( ... )`
- **コメント**：`#` で始まる行

### 2.2 MVP では採用しない構文

| 構文 | PICT BNF での役割 | 落とした理由 |
|---|---|---|
| `[Param] LIKE "pattern"` | ワイルドカードパターンマッチ | 実装コスト高、MVP の評価器では重い |
| サブモデル `{ p1, p2 } @ N` | 部分グループ生成方略 | 制約意味論ではなく PICT 生成方略チューニング。内製評価器の責務外 |
| Weight `Value (N)` | 水準への重み付け | 同上 |
| Negative value `~Value` | 異常系テスト用マーカー | 同上 |
| Default alias separator `\|` | 水準のエイリアス分離記号 | エイリアス機能自体が MVP 範囲外 |

採用外構文を含む DSL は、パーサが `unsupported in MVP` 診断を返す（[SR-002](requirements/system_requirements.yaml)）。位置情報付きで本ファイル §7 の差分表へリンクする UI を提供する。

## 3. Lexical Conventions — Lexical 規則

### 3.1 文字集合

ソースは UTF-8 でエンコードされる。識別子・コメント・文字列リテラル内に Unicode 文字を含めることができる（パラメータ名・水準名に日本語等を使用可）。

### 3.2 空白・改行

- スペース（U+0020）とタブ（U+0009）は token 間で無視される
- 改行（`\n`、`\r\n`、`\r`）は ParameterDecl の終端、および Constraint 末尾の `;` 後の区切りとして意味を持つ

### 3.3 コメント

```
# 任意のコメントテキスト（行末まで）
```

`#` から行末までがコメント。**行頭以外でも `#` 以降は行コメント** として扱う（PICT 互換）。コメントは構文的には空白扱い。

### 3.4 識別子（Identifier）

- パラメータ名、水準名、参照名で使用
- 先頭文字：英字（A-Z / a-z）、`_`、または非 ASCII 文字
- 後続文字：上記＋数字＋内部空白
- 末尾の空白は trim される

### 3.5 文字列リテラル（StringLiteral）

```
"quoted with double quotes"
```

エスケープシーケンス：`\\`, `\"`, `\n`, `\t`。

### 3.6 数値リテラル（NumberLiteral）

```
-?[0-9]+(\.[0-9]+)?
```

整数・小数を許可。指数表記は MVP では採用しない。

### 3.7 キーワード（大文字小文字）

`IF`, `THEN`, `ELSE`, `AND`, `OR`, `NOT`, `IN` は **case-insensitive**（PICT 互換）。本仕様では大文字で記述するが、`if`, `And` 等も等価。識別子としては使用できない（予約語）。

## 4. EBNF Grammar

W3C-style EBNF 表記。`?` はオプション、`*` はゼロ回以上、`+` は 1 回以上、`|` は選択、`( ... )` はグループ化、`'literal'` または `"literal"` は終端記号。

```ebnf
(* ====================================================================
   File structure
   ==================================================================== *)
Model            ::= ParameterSection ConstraintSection?

ParameterSection ::= ( BlankOrComment | ParameterDecl )+
ConstraintSection
                 ::= ( BlankOrComment | Constraint )+

BlankOrComment   ::= EmptyLine | Comment
EmptyLine        ::= NewLine
Comment          ::= '#' CommentChar* NewLine
CommentChar      ::= [^\r\n]

(* ====================================================================
   Parameter section
   ==================================================================== *)
ParameterDecl    ::= ParameterName ':' LevelList NewLine
ParameterName    ::= Identifier
LevelList        ::= Level ( ',' Level )*
Level            ::= Identifier
                   | StringLiteral
                   | NumberLiteral

(* ====================================================================
   Constraint section
   ==================================================================== *)
Constraint       ::= ( IfStatement | UnconditionalConstraint ) ';'

IfStatement      ::= 'IF' Predicate 'THEN' Predicate ( 'ELSE' Predicate )?
UnconditionalConstraint
                 ::= Predicate

Predicate        ::= OrExpr
OrExpr           ::= AndExpr ( 'OR' AndExpr )*
AndExpr          ::= NotExpr ( 'AND' NotExpr )*
NotExpr          ::= 'NOT' NotExpr
                   | AtomicPred
AtomicPred       ::= '(' Predicate ')'
                   | Comparison
                   | InClause

Comparison       ::= ParameterRef Relation ComparisonRhs
ComparisonRhs    ::= Value
                   | ParameterRef
ParameterRef     ::= '[' ParameterName ']'
Relation         ::= '=' | '<>' | '>' | '>=' | '<' | '<='

InClause         ::= ParameterRef 'IN' '{' ValueList '}'
ValueList        ::= Value ( ',' Value )*

(* ====================================================================
   Values
   ==================================================================== *)
Value            ::= Identifier
                   | StringLiteral
                   | NumberLiteral

(* ====================================================================
   Lexical primitives
   ==================================================================== *)
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
```

### 4.1 Operator Precedence

論理演算子の優先順位（高 → 低）：

1. `NOT`（単項、右結合）
2. `AND`（左結合）
3. `OR`（左結合）

`(` `)` で明示的にグループ化可能。比較・IN 句は同レベル（atomic predicate）。

## 5. Type Inference — 型推論

PICT に倣い、パラメータの型は宣言された水準セットから推論する：

- **数値型**：すべての水準値が `NumberLiteral` として解析可能
- **文字列型**：それ以外（混在を含む）

比較・包含演算は型整合性を要する：

- 数値パラメータ vs 数値値：OK
- 文字列パラメータ vs 文字列値：OK
- 数値パラメータ vs 文字列値：パースエラー（`type mismatch`）
- 文字列パラメータ間の `>`, `<`, `>=`, `<=`：辞書順比較

## 6. 例 — Examples

### 6.1 最小例

```
# OS と Browser の組合せ
OS:           Windows, Linux, macOS
Browser:      Chrome, Firefox, Safari

IF [OS] = "Linux" THEN [Browser] <> "Safari";
```

### 6.2 IN 句

```
OS:    Windows, Linux, macOS, FreeBSD
Cloud: AWS, GCP, Azure

IF [OS] IN { "Linux", "FreeBSD" } THEN [Cloud] <> "Azure";
```

### 6.3 数値パラメータ

```
Disk:   100, 500, 1000
Memory: 4, 8, 16

IF [Memory] < 8 THEN [Disk] < 1000;
```

### 6.4 ELSE 句

```
Auth:     OAuth, Basic, None
HTTPS:    Yes, No

IF [Auth] = "OAuth" THEN [HTTPS] = "Yes" ELSE [HTTPS] = "No";
```

### 6.5 NOT と括弧によるグループ化

```
Region:   APAC, EMEA, AMER
Tier:     Free, Pro, Enterprise

IF NOT ( [Region] = "APAC" AND [Tier] = "Free" ) THEN [Tier] <> "Free";
```

### 6.6 パラメータ間比較

```
Min:  1, 2, 3
Max:  1, 2, 3, 4, 5

IF [Min] > [Max] THEN [Min] = [Max];
```

### 6.7 無条件制約（Unconditional Constraint）

```
Status: Active, Inactive, Pending
Role:   Admin, User, Guest

[Status] = "Active" OR [Role] <> "Guest";
```

### 6.8 採用外構文（MVP ではエラー）

以下は MVP では `unsupported in MVP` 診断となる：

```
# LIKE
IF [Filename] LIKE "*.tmp" THEN [Skip] = "Yes";

# サブモデル
{ A, B, C } @ 2

# Weight
OS: Windows (5), Linux (1)

# Negative value
Counter: ~-1, 0, 1, 2
```

## 7. PICT BNF からの差分 — Differences from PICT BNF

### 7.1 PICT 公式 BNF（Constraints セクション）

PICT 公式仕様より引用（[microsoft/pict pict.md](https://github.com/microsoft/pict/blob/main/doc/pict.md)）：

```
Constraint    ::=
  IF Predicate THEN Predicate ELSE Predicate;
| Predicate;

Predicate     ::=
  Clause
| Clause LogicalOperator Predicate

Clause        ::=
  Term
| ( Predicate )
| NOT Predicate

Term          ::=
  ParameterName Relation Value
| ParameterName LIKE PatternString
| ParameterName IN { ValueSet }
| ParameterName Relation ParameterName

LogicalOperator ::= AND | OR
Relation      ::= = | <> | > | >= | < | <=
```

### 7.2 NeoCombi MVP との差分

| PICT BNF | NeoCombi MVP | 状態 |
|---|---|---|
| `ParameterName Relation Value` | 採用 | ✅ |
| `ParameterName Relation ParameterName` | 採用 | ✅ |
| `ParameterName IN { ValueSet }` | 採用 | ✅ |
| `IF Predicate THEN Predicate ELSE Predicate` | 採用 | ✅ |
| `Predicate;`（無条件制約） | 採用 | ✅ |
| `LogicalOperator ::= AND \| OR` | 採用 | ✅ |
| `NOT Predicate` | 採用 | ✅ |
| `Relation` 全 6 種 | 採用 | ✅ |
| `( Predicate )` | 採用 | ✅ |
| Comments `#` | 採用 | ✅ |
| `ParameterName LIKE PatternString` | 不採用 | ❌ MVP 範囲外 |
| サブモデル `{ p1, p2 } @ N` | 不採用 | ❌ MVP 範囲外 |
| Level weight `Value (N)` | 不採用 | ❌ MVP 範囲外 |
| Negative value `~Value` | 不採用 | ❌ MVP 範囲外 |
| Default value separator override（`/d`） | 不採用 | カンマ固定 |
| Default alias separator override（`/a`） | 不採用 | エイリアス機能自体が範囲外 |

### 7.3 NeoCombi 独自の追加

なし。本 MVP では PICT BNF のサブセットのみで、独自構文の追加はしない。これにより：

- ユーザは PICT 公式ドキュメントをそのまま参照可能
- DSL → PICT 入力の変換は薄く（passthrough あるいは AST 経由の再シリアライズ）
- AI 生成（[UR-007](requirements/user_requirements.yaml)）時のターゲット文法が単純で、生成成功率が上がりやすい

## 8. PICT への変換 — Translation to PICT Input

NeoCombi MVP DSL は PICT BNF のサブセットなので、PICT 入力ファイルへの変換は基本的に **identity transform**：

| NeoCombi DSL | PICT 入力 |
|---|---|
| パラメータ宣言 | そのまま渡す |
| 制約節（IF/THEN/ELSE / 無条件） | そのまま渡す |
| `[ParameterName]` 参照 | そのまま渡す |
| `IN { ... }` | そのまま渡す |
| 比較・論理演算子 | そのまま渡す |
| コメント `#` | そのまま渡す |

実装方針としては、AST 経由で再シリアライズする方が安全（ホワイトスペース正規化、エラー位置の精度向上）。文字列レベルの passthrough は避ける。

## 9. Validation — DSL 検証の振る舞い

[SR-002](requirements/system_requirements.yaml) で定義する診断分類：

| 診断種別 | 条件 | 例 |
|---|---|---|
| Syntax error | 文法エラー | `IF [A] THEN ;` |
| Unknown parameter | 未宣言パラメータ参照 | `IF [Undefined] = "x" THEN ...` |
| Unknown level | 宣言にない水準値の参照 | `IF [OS] = "iOS"`（OS に iOS が無い） |
| Type mismatch | 型不一致 | `IF [NumericParam] = "string"` |
| Unsupported in MVP | MVP 範囲外構文 | `LIKE`、`~`、`{...} @ N`、`(N)` weight |

すべて位置情報付きで報告し、エディタでアンダーライン表示する。

## 10. References

- [Microsoft PICT — pict.md](https://github.com/microsoft/pict/blob/main/doc/pict.md)
- [ADR-001: PICT BNF を最小サブセットとして mirror する](adr/ADR-001-mirror-pict-bnf-subset.yaml)
- [ADR-005: DSL 評価器を内製し、禁則ビューを PICT 非依存で計算する](adr/ADR-005-builtin-dsl-evaluator.yaml)
- [SR-001..003: DSL Authoring](requirements/system_requirements.yaml) — 編集・検証・エラー表示
- [PROJECT_KICKOFF.md §4](PROJECT_KICKOFF.md) — 「mirror する範囲（MVP は最小サブセット）」の決定経緯
