# NeoCombi User Manual / NeoCombi ユーザーマニュアル

**Version**: 1.0
**Date**: 2026-06-20
**DSL Grammar**: 1.0 (see [DSL_Grammar_Specification.md](DSL_Grammar_Specification.md))
**Status**: First release (MVP) / 初版（MVP）

---

## Overview / 概要

NeoCombi is a combinatorial test-design tool. You describe a problem space as
**factors** (parameters) and their **levels** (values), rule out infeasible
combinations with **constraints** written in a PICT-style DSL, and generate test
cases two ways: **pairwise / N-wise** (delegated to Microsoft PICT) or a full
**decision table** (every combination, with forbidden ones marked).

NeoCombi は組み合わせテスト設計ツールです。問題空間を**因子**（パラメータ）と
**水準**（値）で表し、実行不能な組み合わせを **PICT 風の DSL** による**制約**で
除外し、テストケースを2通りで生成します ── **ペアワイズ / N-wise**（Microsoft
PICT に委譲）と、**デシジョンテーブル**（全組み合わせ。禁止行は印付き）。

**System Requirements / 動作環境**

- A modern browser (Chrome, Firefox, Edge, Safari). Authoring, the forbidden
  view, the coverage matrix, decision-table generation, and file save/open all
  run **client-side** — no data leaves your browser.
- **Pairwise generation** additionally needs a **PICT service** (see
  [§10](#10-self-hosting--セルフホスト)). The hosted demo has one configured.
- Optional: the **CLI** (Node.js) and **HTTP API** for CI/CD.

ブラウザ（Chrome / Firefox / Edge / Safari）。オーサリング・禁則ビュー・総当たり表・
デシジョンテーブル生成・ファイル保存/開くは**すべてブラウザ内**で動き、データは外に
出ません。**ペアワイズ生成だけ** PICT サービスが別途必要です（[§10](#10-self-hosting--セルフホスト)）。

---

## Table of Contents / 目次

1. [Introduction / はじめに](#1-introduction--はじめに)
2. [Quick Start / クイックスタート](#2-quick-start--クイックスタート)
3. [Screen Layout / 画面構成](#3-screen-layout--画面構成)
4. [Factors & Levels / 因子と水準](#4-factors--levels--因子と水準)
5. [The Constraint DSL / 制約 DSL](#5-the-constraint-dsl--制約-dsl)
6. [Forbidden View / 禁則ビュー](#6-forbidden-view--禁則ビュー)
7. [Coverage Matrix / 総当たり表](#7-coverage-matrix--総当たり表)
8. [Generating Test Cases / テストケース生成](#8-generating-test-cases--テストケース生成)
9. [Mask Levels / マスク水準](#9-mask-levels--マスク水準)
10. [Self-Hosting / セルフホスト](#10-self-hosting--セルフホスト)
11. [CLI / コマンドライン](#11-cli--コマンドライン)
12. [HTTP API / API](#12-http-api--api)
13. [DSL Grammar Reference v1.0 / DSL 文法リファレンス v1.0](#13-dsl-grammar-reference-v10--dsl-文法リファレンス-v10)
14. [Troubleshooting / トラブルシューティング](#14-troubleshooting--トラブルシューティング)

---

## 1. Introduction / はじめに

NeoCombi is a modern reconstruction of the author's Excel VBA tool **PICT-PAPP**,
scaled for HAYST-method workloads of 100–300 factors. A project is a single
**`.tmodel`** file: plain PICT input plus a few `# @neocombi:` annotations, so it
is also a valid PICT model file.

NeoCombi は著者の Excel VBA ツール **PICT-PAPP** を再構築したもので、HAYST 法
100〜300 因子規模を想定します。プロジェクトは1つの **`.tmodel`** ファイル
（PICT 入力＋少数の `# @neocombi:` 注釈）で、そのまま PICT モデルとしても有効です。

**Two generation strategies / 2つの生成方略**

| | Pairwise / N-wise | Decision table / デシジョンテーブル |
|---|---|---|
| What / 何を | A small set covering all pairs (or N-tuples) | **Every** combination of all factors |
| Engine / エンジン | Microsoft PICT (external) | NeoCombi built-in (in browser) |
| Forbidden rows / 禁止行 | Excluded | **Kept and marked** with `X` |
| Use when / 使う場面 | Many factors (full product explodes) | Few factors, exhaustive coverage wanted |
| Limit / 上限 | — | Refused above **512** combinations |

NeoCombi is one of three sibling tools: **NeoCEG** (cause-effect graphs) and
**ModelLogue** (AI-assisted review). NeoCombi and NeoCEG are deterministic
converters with no embedded AI.

NeoCombi は3兄弟の一つで、**NeoCEG**（原因結果グラフ）・**ModelLogue**（AI 支援
レビュー）が姉妹です。NeoCombi と NeoCEG は AI を内蔵しない決定論変換器です。

---

## 2. Quick Start / クイックスタート

1. Open the app (the hosted demo: <https://neo-combi.vercel.app/>).
   アプリを開く（デモ: <https://neo-combi.vercel.app/>）。
2. **Load a sample**, or start from scratch. Samples open via a URL parameter:
   サンプルは URL 引数で開けます:
   `…/?file=https://sho1884.github.io/public-files/NeoCombi/Samples/printer.tmodel`
3. In the bottom pane, edit **Factors & Levels** or the **DSL** directly — the
   two stay in sync. 下ペーンで **Factors & Levels** か **DSL** を編集（双方向同期）。
4. Watch the **Forbidden** and **Coverage** views (top pane) update live.
   上ペーンの **Forbidden** / **Coverage** がライブ更新。
5. Open the **Test cases** tab, pick a **Mode** (Pairwise / Decision table), and
   click **Generate**. **Test cases** タブで **Mode** を選び **Generate**。
6. Fill in **Expected** values, then **Copy** or **Download** (CSV / JSON).
   **Expected** を記入し、**Copy** / **Download**（CSV/JSON）。
7. Save the project as a `.tmodel` file from the **File** menu.
   **File** メニューから `.tmodel` で保存。

---

## 3. Screen Layout / 画面構成

The window is split into a **top pane** (read-only visualizations) and a
**bottom pane** (authoring + results), with a draggable divider.

画面は**上ペーン**（読み取り専用の可視化）と**下ペーン**（オーサリング＋結果）に
分かれ、境界はドラッグで調整できます。

- **Top pane / 上ペーン** — two tabs:
  - **Coverage** — exhaustive cross-tabulation of factor pairs ([§7](#7-coverage-matrix--総当たり表)).
  - **Forbidden** — forbidden combinations derived from the constraints ([§6](#6-forbidden-view--禁則ビュー)).
- **Bottom pane / 下ペーン** — three tabs:
  - **Factors & Levels** — structured table ([§4](#4-factors--levels--因子と水準)).
  - **DSL** — the constraint DSL editor ([§5](#5-the-constraint-dsl--制約-dsl)).
  - **Test cases** — generation, expected values, export ([§8](#8-generating-test-cases--テストケース生成)).

The **File** menu (New / Open / Save) reads and writes `.tmodel` files.
**File** メニュー（New / Open / Save）が `.tmodel` を読み書きします。

---

## 4. Factors & Levels / 因子と水準

The **Factors & Levels** table is a structured view of the DSL parameter section.
Edits here and in the DSL editor are kept in sync.

**Factors & Levels** 表は DSL のパラメータ部の構造化ビューで、DSL エディタと同期します。

- **Add / rename / remove** factors and levels. Renaming a factor or level
  rewrites every `[reference]` in the constraints automatically.
  因子・水準の**追加/改名/削除**。改名すると制約中の `[参照]` も自動で書き換わります。
- **Reorder** by dragging the grip handle (factors) or chips (levels).
  グリップ（因子）や水準チップの**ドラッグ**で並べ替え。
- The per-factor **Show** checkbox controls which factors appear in the coverage
  matrix. 因子ごとの **Show** で総当たり表の表示対象を絞れます。

A factor's **type** is inferred from its levels (numeric if every level parses as
a number; otherwise string), following PICT.

因子の**型**は水準から推論されます（全水準が数値なら数値型、そうでなければ文字列型）。

---

## 5. The Constraint DSL / 制約 DSL

NeoCombi's DSL is a strict subset of the **PICT constraint language**, defined as
**Grammar v1.0** (full spec: [DSL_Grammar_Specification.md](DSL_Grammar_Specification.md);
summary in [§13](#13-dsl-grammar-reference-v10--dsl-文法リファレンス-v10)). The DSL is the
single source of truth for factors, levels, and constraints; the editor validates
it in real time and underlines errors.

NeoCombi の DSL は **PICT 制約言語の厳密なサブセット**で、**文法 v1.0** として定義
されています。DSL が因子・水準・制約の唯一の真実源で、エディタがリアルタイム検証し
エラーに下線を引きます。

**Parameters / パラメータ宣言**

```
PaperSize: A4, Letter, Legal
Memory:    4, 8, 16
```

**Constraints / 制約** — `IF … THEN … [ELSE …];` or an unconditional `Predicate;`

```
# Legal paper has no landscape duplex on this device
IF [PaperSize] = "Legal" AND [Orientation] = "Landscape" THEN [DuplexMode] = "None";

# Unconditional
[Status] = "Active" OR [Role] <> "Guest";
```

**Operators / 演算子**

- Comparison / 比較: `=` `<>` `>` `>=` `<` `<=`
- Logical / 論理: `AND` `OR` `NOT` (keywords are case-insensitive)
- Set membership / 集合: `[Param] IN { "v1", "v2" }`
- Grouping / グループ化: `( … )`
- Parameter reference / 参照: `[ParameterName]`

> **Important / 重要:** on the right-hand side of a comparison and inside `IN { }`,
> values must be **quoted strings or numbers** — a bare word is rejected (PICT
> itself rejects it). In parameter *declarations*, bare level values are fine.
> 比較の右辺と `IN { }` の中の値は**クォート文字列か数値**にしてください（裸の語は
> エラー。PICT 自身が拒否します）。**宣言**部の水準は裸でも構いません。

`LIKE`, sub-models (`{…} @ N`), weights (`Value (N)`), and negative values (`~`)
are **not supported in this MVP** and produce an "unsupported in MVP" diagnostic.

`LIKE`・サブモデル・重み・負値マーカーは **MVP 非対応**で診断が出ます。

---

## 6. Forbidden View / 禁則ビュー

The **Forbidden** tab (top pane) shows, as a matrix, which combinations your
constraints forbid. It is computed by NeoCombi's built-in evaluator — **PICT is
not involved** — so it updates live as you edit.

**Forbidden** タブは、制約が禁じる組み合わせをマトリクスで示します。NeoCombi の
内製評価器が計算する（**PICT 不使用**）ので、編集に追従してライブ更新します。

- Choose **N** and a **slice**: N−1 condition factors (row axis) × 1 constrained
  factor (column axis). **N** と**スライス**（条件因子 N−1 個 × 被制約因子 1 個）を選択。
- Forbidden cells are marked **`X`** (red); allowed cells are blank.
  禁止セルは赤い **`X`**、許可セルは空白。
- **Suggest from constraints** appends slices derived automatically from your
  constraints. **Suggest from constraints** で制約からスライスを自動提案。
- **Copy** / **Download** exports the slice as HTML / CSV.

---

## 7. Coverage Matrix / 総当たり表

The **Coverage** tab (top pane) is an exhaustive cross-tabulation of every factor
pair. After you generate test cases, it overlays how many cases cover each pair.

**Coverage** タブは全因子ペアの総当たり表です。テストケース生成後、各ペアを何件の
ケースが覆っているかを重ねて表示します。

**Cell markers / セルの記号**

| Marker | Meaning / 意味 |
|---|---|
| a number / 数字 | occurrence count (how many cases cover this pair) / そのペアを覆うケース数 |
| `X` | forbidden by a constraint / 制約で禁止 |
| `?` | allowed but **not covered** (a gap to investigate) / 許可だが**未被覆**（要調査） |
| `·` | placeholder (no test cases generated yet) / 未生成のプレースホルダ |
| `—` | diagonal (a factor against itself) / 対角（同一因子） |

Use the per-factor checkboxes ([§4](#4-factors--levels--因子と水準)) to narrow the matrix.

---

## 8. Generating Test Cases / テストケース生成

Open the **Test cases** tab, choose a **Mode**, and click **Generate** /
**Re-generate**. The table shows one row per case; columns are the factors plus
an **Expected** column (and a **Forbidden** column in decision-table mode).

**Test cases** タブで **Mode** を選び **Generate / Re-generate**。1 行 1 ケースで、
列は因子＋ **Expected**（デシジョンテーブルでは **Forbidden** 列も）です。

**Pairwise / N-wise mode / ペアワイズ・N-wise**

- Routes to the external **PICT** service; the order N defaults to 2 (pairwise).
- Produces a reduced covering set; forbidden combinations do not appear.
- 外部 **PICT** に委譲。N は既定 2（ペアワイズ）。削減された被覆集合で、禁止行は出ません。

**Decision-table mode / デシジョンテーブル**

- Runs the **built-in core in your browser** (no PICT, no network).
- Emits **every** combination of all factors, in declared order. Forbidden rows
  are **kept and marked `X`**, not excluded — so you see the full table.
- Refused when the product exceeds **512** combinations (it shows the count and
  the limit). It is a small-factor-set technique.
- ブラウザ内のコアで動作（PICT もネットワークも不要）。全因子の**全組み合わせ**を
  宣言順に出し、禁止行は**除外せず `X` で印**。**512** 超で拒否（件数と上限を表示）。

**Expected values / 期待値**

Click an **Expected** cell to type the predicted result. Expected values are
preserved across regeneration (matched by stable factor/level identity) and are
saved in the `.tmodel` file.

**Expected** セルに期待結果を入力。再生成しても（安定 ID で対応づけて）保持され、
`.tmodel` に保存されます。

**Export / 出力**

- **Copy** — both an HTML table (for Excel / Sheets) and plain text in the
  selected format. HTML 表（Excel/Sheets 用）＋選択形式のプレーンテキスト。
- **Download** — CSV or JSON. For a decision table, the **Forbidden** column is
  included. デシジョンテーブルでは **Forbidden** 列も含めて出力。

---

## 9. Mask Levels / マスク水準

A **mask level** represents a factor being unreachable because of other factors —
e.g. a card-number factor is effectively absent when payment is cash. NeoCombi
inherits PICT-PAPP's convention: add a dedicated level and pin it with an
`IF … THEN` constraint. No DSL extension is needed.

**マスク水準**は、他因子の値で当該因子が到達不能になる状態（例：支払=現金 のとき
カード番号は実質存在しない）。専用水準を加え `IF … THEN` で固定します。DSL 拡張は不要。

- The sentinel value is exactly **`_MASK_`** (used identically on any factor).
  センチネル値は **`_MASK_`**（全因子共通）。
- It is shown **de-emphasized** (muted, italic) wherever levels appear, so it
  reads differently at a glance. 水準が出る各所で**控えめ表示**（淡色・斜体）。
- A **warning** is raised if a factor declares `_MASK_` but no constraint binds it
  — an unbound mask level is usually an incomplete model.
  `_MASK_` を宣言したのに束縛する制約が無いと**警告**（束縛漏れはモデル不備の兆候）。

---

## 10. Self-Hosting / セルフホスト

The browser app is a static site; **decision-table** generation, the forbidden
view, and the coverage matrix work with no backend. Only **pairwise** needs a
**PICT service**.

ブラウザ版は静的サイトで、**デシジョンテーブル**・禁則ビュー・総当たり表は
バックエンド不要。**ペアワイズ**だけ **PICT サービス**が要ります。

1. **Run the PICT service.** Build and run the container in
   [`pict-service/`](../pict-service/) (it compiles PICT from source):
   ```bash
   docker build -t neocombi/pict-service ./pict-service
   docker run --rm -p 8765:8765 neocombi/pict-service
   ```
   It exposes `/health`, `/generate`, and `/decision-table` ([§12](#12-http-api--api)).
   See [`pict-service/README.md`](../pict-service/README.md) for cloud deploy
   (e.g. Cloud Run / Render) and the security knobs (`ALLOWED_ORIGINS`,
   `PICT_TIMEOUT_MS`, `MAX_ORDER`, `RATE_LIMIT_PER_MIN`).
2. **Point the GUI at it.** Build the GUI with the env var
   `VITE_PICT_API_URL=https://your-pict-service` and deploy the static site.
   GUI は `VITE_PICT_API_URL` にサービス URL を指定してビルド・配信します。
3. **Samples.** Host `.tmodel` files anywhere and open them with
   `?file=<url>`. `.tmodel` を任意の場所に置き `?file=<url>` で開けます。

---

## 11. CLI / コマンドライン

For CI/CD, NeoCombi runs headless and consumes a `.tmodel` file. Identical inputs
always produce identical outputs.

CI/CD 向けに headless 実行し、`.tmodel` を入力にとります。同じ入力は常に同じ出力です。

```bash
neocombi generate <input.tmodel> [options]
```

| Option | Meaning / 意味 |
|---|---|
| `--decision-table` | Generate the decision table via the built-in core (no PICT). 内製コアで全組み合わせ生成 |
| `--format csv\|tsv\|json` | Output format (default: csv) / 出力形式 |
| `--output <file>` | Write to a file instead of stdout / ファイルへ出力 |
| `--order <N>` | Generation order for pairwise / N-wise / 生成強度 N |
| `--pict <path>` | Path to the PICT executable (pairwise) / PICT 実行ファイル |

**Exit codes / 終了コード** (each has one meaning tool-wide / ツール全体で一意):

| Code | Meaning / 意味 |
|---|---|
| 0 | success / 成功 |
| 1 | DSL parse / validation error / DSL エラー |
| 2 | PICT invocation failed (pairwise) / PICT 起動失敗 |
| 3 | input file not found / unreadable / 入力読めず |
| 4 | output write failed / 出力書き込み失敗 |
| 5 | decision table too large (> 512) / デシジョンテーブルが大きすぎる |

Output is **atomic**: a complete table or nothing — a partial table is never
written. 出力は**原子的**：完全な表か何も出さないか。途中までの表は出しません。

---

## 12. HTTP API / API

The PICT service is also an HTTP API, suitable for calling from CI/CD or other
programs. PICT サービスは HTTP API でもあり、CI/CD や他プログラムから呼べます。

| Endpoint | Body | Response |
|---|---|---|
| `GET /health` | — | `{ ok, available, version, path }` |
| `POST /generate?order=N` | DSL text | PICT TSV (pairwise) |
| `POST /decision-table` | DSL text | decision-table JSON |

`POST /decision-table` returns one of:

- **200** `{ columns: string[], rows: [{ values: string[], forbidden: boolean }] }`
- **400** `{ reason: "invalid-model", diagnostics }` — DSL did not parse
- **413** `{ reason: "too-large", count, limit: 512 }` — over the limit

Responses are atomic — a complete table or an error, never a partial body.
応答は原子的（完全な表かエラーのみ）。

---

## 13. DSL Grammar Reference v1.0 / DSL 文法リファレンス v1.0

This is the canonical grammar, **version 1.0**. The full specification, lexical
rules, type inference, and the PICT-BNF diff are in
[DSL_Grammar_Specification.md](DSL_Grammar_Specification.md).

これが正準文法 **バージョン 1.0** です。完全仕様・字句規則・型推論・PICT BNF との
差分は [DSL_Grammar_Specification.md](DSL_Grammar_Specification.md) を参照。

```ebnf
(* NeoCombi DSL Grammar — Version 1.0 *)
Model            ::= ParameterSection ConstraintSection?

ParameterDecl    ::= ParameterName ':' LevelList NewLine
LevelList        ::= Level ( ',' Level )*
Level            ::= Identifier | StringLiteral | NumberLiteral

Constraint       ::= ( IfStatement | UnconditionalConstraint ) ';'
IfStatement      ::= 'IF' Predicate 'THEN' Predicate ( 'ELSE' Predicate )?
UnconditionalConstraint ::= Predicate

Predicate        ::= OrExpr
OrExpr           ::= AndExpr ( 'OR' AndExpr )*
AndExpr          ::= NotExpr ( 'AND' NotExpr )*
NotExpr          ::= 'NOT' NotExpr | AtomicPred
AtomicPred       ::= '(' Predicate ')' | Comparison | InClause

Comparison       ::= ParameterRef Relation ( Value | ParameterRef )
ParameterRef     ::= '[' ParameterName ']'
Relation         ::= '=' | '<>' | '>' | '>=' | '<' | '<='
InClause         ::= ParameterRef 'IN' '{' Value ( ',' Value )* '}'

Value            ::= StringLiteral | NumberLiteral   (* no bare identifier *)
```

Operator precedence (high → low): `NOT` (unary) > `AND` > `OR`. Keywords
(`IF THEN ELSE AND OR NOT IN`) are case-insensitive.

優先順位（高→低）：`NOT` > `AND` > `OR`。キーワードは大文字小文字を区別しません。

---

## 14. Troubleshooting / トラブルシューティング

| Symptom / 症状 | Cause & fix / 原因と対処 |
|---|---|
| Pairwise **Generate** fails on the hosted demo / デモでペアワイズが失敗 | The PICT service may be waking from idle — wait a moment and retry. Or use **Decision table** mode (in-browser). スリープ復帰待ち。再試行するか、デシジョンテーブルを使う |
| "Too many combinations (… > 512)" / 512 超 | Decision tables are for small factor sets. Reduce factors/levels, or use **Pairwise**. 因子/水準を減らすか、ペアワイズへ |
| A constraint is silently ignored by PICT / 制約が無視される | A value on a comparison RHS / in `IN { }` must be **quoted** or a number, not a bare word. 比較右辺・`IN` の値はクォートか数値に |
| "unsupported in MVP" on `LIKE` / `~` / `{…}@N` / `(N)` | Those PICT features are out of scope for this release. これらは本リリース対象外 |
| A masked situation never appears in test cases / マスク状況が出ない | You likely forgot the mask level; see [§9](#9-mask-levels--マスク水準) (`_MASK_` + an `IF … THEN`). マスク水準の付け忘れ |

---

## References / 参考

- [DSL_Grammar_Specification.md](DSL_Grammar_Specification.md) — DSL grammar v1.0 (full).
- [requirements/Requirements_Specification.md](requirements/Requirements_Specification.md) — UR / SR.
- [pict-service/README.md](../pict-service/README.md) — PICT service deploy & config.
- [Microsoft PICT](https://github.com/microsoft/pict/blob/main/doc/pict.md) — the upstream constraint language.
- Sibling tools: [NeoCEG](https://github.com/sho1884/NeoCEG), [ModelLogue](https://github.com/sho1884/ModelLogue).
