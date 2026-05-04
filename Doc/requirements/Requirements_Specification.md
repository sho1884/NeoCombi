# NeoCombi Requirements Specification

> User Requirements (UR) と System Requirements (SR) の Markdown ビュー（人間向けの読みやすい view）。
> **一次資料は YAML**（`Doc/requirements/user_requirements.yaml`、`Doc/requirements/system_requirements.yaml`）。本ファイルはそれを元に手で書き起こしている。整合性が崩れた場合は YAML が正であり、本ファイルを更新する。
>
> Status: draft (2026-05-04, v0.2-draft). MVP planning + v0.2 候補（UR-008）。**本ファイルは仕様レビュー＆合意のための view であり、コーディング着手の前提**（`CLAUDE.md` 「ドキュメント・ファースト」方針）。

## 1. 概要 — Overview

**NeoCombi** は、ペアワイズ組み合わせテストと因子・水準・制約の管理を統合した総合組み合わせテスト設計ツール。Microsoft **PICT**（Pairwise Independent Combinatorial Testing）を内部エンジンとして外部 CLI で呼び出し、その制約言語（[PICT BNF サブセット](../DSL_Grammar_Specification.md)）を一級構文として扱う。

著者の旧 Excel VBA ツール **PICT-PAPP** を React + TypeScript で再構築した機能的後継であり、HAYST 法 100〜300 因子規模の実務に耐えることを目標とする。

NeoCombi は **3 兄弟** の一員：

- **[NeoCEG](https://github.com/sho1884/NeoCEG)** — 原因結果グラフ（CEG）ツール
- **NeoCombi** — 本プロジェクト（ペアワイズ + 因子水準）
- **[ModelLogue](https://github.com/sho1884/ModelLogue)** — AI レビュープラットフォーム

NeoCEG / NeoCombi は決定論変換器（AI 不内蔵）。AI 連携は n8n 経由のパススルーに限定（[ADR-003](../adr/ADR-003-no-embedded-ai-n8n-passthrough.yaml)）。アーキテクチャ判断は [`PROJECT_KICKOFF.md`](../PROJECT_KICKOFF.md)、技術判断は [`adr/`](../adr/) を参照。

## 2. MVP スコープ — MVP Scope

### 2.1 含める

- DSL（PICT BNF 最小サブセット）の編集・検証・エラー表示
- 因子・水準表の編集（DSL と双方向同期）
- 上ペーンの総当たり表（チェックボックスで因子表示制御、出現回数オーバーレイ）
- 内製 DSL 評価器による多項間禁則表（参照ビュー、N 切替）
- PICT 外部 CLI 呼び出しによるテストケース生成
- テストケース表 + 期待値カラム（再生成跨ぎで stable id により保持）
- `.tmodel` プロジェクトファイル形式（[ADR-009](../adr/ADR-009-tmodel-file-extension.yaml)）
- CLI モード（CI/CD 向け headless 実行）

### 2.2 含めない（v2 以降）

- AI 連携（n8n 経由の自然言語 → DSL 生成。最終ビジョンとしてレイアウトだけ準備）
- DSL の `LIKE` 演算子、サブモデル、weight、negative value
- PICT-PAPP の Step5（Alloy 検証）、Step6/7（水準値展開）、Step1'（多項間禁則表からの DSL 自動生成）
- CIT-BACH 等、PICT 以外の生成エンジン対応

## 3. User Requirements

優先度は high / medium / future の 3 段階。high と medium が MVP 対象、future は最終ビジョンとして記録のみで AC は v2 で書く。

### UR-001 — Generate pairwise test cases

- **Priority:** high
- **Background:** Pairwise（または N-wise）テストケース生成は、前身ツール PICT-PAPP から継承する核機能。NeoCombi は生成アルゴリズムを Microsoft PICT に委譲（外部 CLI として呼び出し、[ADR-002](../adr/ADR-002-invoke-pict-as-external-cli.yaml)）し、本体は前後処理（DSL オーサリング、可視化、出力整形）に専念する。

### UR-002 — Author factors, levels, and constraints

- **Priority:** high
- **Background:** テスト設計者は問題空間を因子と水準で表現し、実行不能な組合せを制約で除外する。制約は PICT DSL（[サブセット仕様](../DSL_Grammar_Specification.md)）で直接記述する。因子・水準表と DSL エディタは下ペーンを共有し、タブで切り替える（[ADR-006](../adr/ADR-006-split-pane-with-tabbed-bottom.yaml)）。

### UR-003 — Verify forbidden combinations derived from constraints

- **Priority:** high
- **Background:** 制約式（intensional 表現）は禁則 N 因子組合せ（extensional 表現）を含意する。設計者は導出された禁則集合が意図と一致するかを視覚的に確認したい。本ビューは内製 DSL 評価器が DSL から計算する read-only ビューで（[ADR-005](../adr/ADR-005-builtin-dsl-evaluator.yaml), [ADR-007](../adr/ADR-007-forbidden-matrix-as-reference-view.yaml)）、ユーザはセルを直接編集できない。N をスライダで選択でき、マトリクスは「条件因子 × 被制約因子」のスライスを 1 枚ずつ表示する。

### UR-004 — Verify pair coverage of generated test cases

- **Priority:** medium
- **Background:** PICT 生成後、各因子ペアがカバーされたか（あるいは禁則 vs 漏れか）を確認したい。上ペーンの総当たり表に出現回数をオーバーレイ表示する。各因子の行にチェックボックスを置き、表示対象因子を絞れる。

### UR-005 — Record expected values for test cases

- **Priority:** high
- **Background:** 期待値（出力 / 判定基準）が無いテストケースは実行不能。NeoCombi は各テストケース行に期待値カラムを持つ（PICT-PAPP には無い新機能、[ADR-008](../adr/ADR-008-expected-value-column-in-test-cases.yaml)）。期待値は factor / level の identity が安定している限り再生成跨ぎで保持される。

### UR-006 — Invoke from CI/CD pipeline deterministically

- **Priority:** medium
- **Background:** テスト設計はバージョン管理された入力から再現可能であるべき。NeoCombi は CLI モードを提供し、`.tmodel` ファイルを入力として CSV/JSON を出力する（GUI 非依存、headless 動作）。同じ入力からは常に同じ出力（AI 不内蔵、非決定性なし）。

### UR-007 — Draft DSL from natural-language requirements via AI

- **Priority:** future（MVP 範囲外）
- **Background:** 最終ビジョン：設計者が下ペーンの専用タブにテスト対象の振る舞いを自然言語で書き、AI（n8n 連携経由）が PICT DSL を起草、人間がレビュー＆修正して完成させる。NeoCombi 本体は決定論変換器のままで、AI は外部パススルー、内蔵しない（[ADR-003](../adr/ADR-003-no-embedded-ai-n8n-passthrough.yaml)）。MVP では下ペーンのレイアウトとデータモデルだけを将来拡張可能な形で固める。ModelLogue の n8n 連携実装が成熟したら同パターンに追従。

### UR-008 — Make mask levels easy to author and hard to forget

- **Priority:** medium（v0.2 候補）
- **Background:** 「mask 水準」とは、ある因子が他因子の値で実質的に到達不能になる状態（例：支払方法=現金 のときカード番号は実質存在しない）。前身 PICT-PAPP の運用慣習を継承し、影響を受ける因子に専用水準を 1 つ加え、トリガ条件の IF-THEN でその水準に固定する ── **既存の PICT DSL でそのまま表現でき、拡張も新オペレータも新データモデルも不要**。NeoCombi は変更しない DSL の上に UI 補助 2 点（特別記号での入力・表示／不備警告 lint）を追加し、「mask 水準を立てるのを忘れて生成テストケースから masked 状況が静かに脱落する」リスクを減らす。

## 4. System Requirements

カテゴリ別に整理（10 番台で連番）。各 SR の `function`（Verb + Object）と主要 outcome を要約。詳細シナリオは [`system_requirements.yaml`](system_requirements.yaml) 参照。

### 4.1 dsl_authoring（SR-001..003） — Parent: UR-002

DSL エディタは下ペーンの 1 タブとして提供。PICT BNF サブセットを直接書く（[ADR-001](../adr/ADR-001-mirror-pict-bnf-subset.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-001 | Edit DSL text in editor | DSL タブで自由テキスト編集。空状態では grammar spec へのプレースホルダリンク表示 |
| SR-002 | Validate DSL syntax in real time | 編集ごとに incremental parse。LIKE / submodel / weight / negative value は `unsupported in MVP` 診断 |
| SR-003 | Display syntax errors with location | エラー位置にアンダーライン、ホバーでメッセージ。複数エラーはサイドパネルでリスト表示 |

### 4.2 factor_level_table（SR-010..012） — Parent: UR-002

因子・水準表は DSL のパラメータセクションを構造化したビュー。両者は双方向に同期する。

| ID | Function | 概要 |
|---|---|---|
| SR-010 | Manage factors | 因子の追加・改名・削除。DSL 宣言と他参照（制約・テストケース・マトリクス）が連動更新 |
| SR-011 | Manage levels per factor | 水準の追加・改名・削除。改名時は内部 ID で参照を維持 |
| SR-012 | Synchronize factor-level table with DSL | DSL → 表（parse 成功時に再描画）／表 → DSL（コミット時にパラメータセクション再生成、制約・コメントは保持） |

### 4.3 bottom_pane（SR-020） — Parent: UR-002

下ペーンのタブ切替コンテナ。MVP では 3 タブ、将来 4 タブに拡張する設計（[ADR-006](../adr/ADR-006-split-pane-with-tabbed-bottom.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-020 | Switch bottom-pane tab | タブヘッダクリックで切替。タブ間で編集状態は保持。AI 連携 ON 時は「自然言語要求仕様」タブを追加（v2） |

### 4.4 forbidden_view（SR-030..033） — Parent: UR-003

多項間禁則表のビュー。**PICT 非依存** — 内製 DSL 評価器が計算する（[ADR-005](../adr/ADR-005-builtin-dsl-evaluator.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-030 | Compute N-factor forbidden combinations from DSL | 内製評価器がスライス内の全水準組合せを列挙し DSL を評価 |
| SR-031 | Render multi-factor forbidden-combination matrix slice | 2D マトリクス。行 = 条件因子の水準組合せ（ネスト）、列 = 被制約因子の水準 |
| SR-032 | Configure matrix slice | N（≥2）と「条件因子 N-1 個 + 被制約因子 1 個」の選択 |
| SR-033 | Manage multiple matrix slices as switchable views | 複数スライスをタブ的に切替（並列表示はしない） |

### 4.5 coverage_view（SR-040..043） — Parent: UR-004

上ペーンの総当たり表。PICT 生成結果からの出現回数をオーバーレイ。

| ID | Function | 概要 |
|---|---|---|
| SR-040 | Render exhaustive cross-tabulation matrix in top pane | 全因子ペアの水準交叉表 |
| SR-041 | Toggle factor visibility via per-row checkbox | 因子行のチェックボックスで表示対象を絞る |
| SR-042 | Overlay occurrence count from generated test cases | 各セルにテストケース出現回数。禁則セル / 漏れセルを視覚的に区別 |
| SR-043 | Highlight uncovered non-forbidden combinations | 「禁則ではないのに未出現」のセルを警告色（黄色）で強調 |

### 4.6 test_case_table（SR-050..053） — Parent: UR-001, UR-005

PICT 生成結果のテストケース表。期待値カラムを持ち、再生成跨ぎで保持（[ADR-008](../adr/ADR-008-expected-value-column-in-test-cases.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-050 | Display PICT-generated test cases | 1 行 = 1 テストケース。列 = 因子 + 期待値 |
| SR-051 | Provide expected-value column | 自由テキスト入力 |
| SR-052 | Preserve expected values across regeneration | factor / level の stable id をキーに引継ぎ。改名対応 |
| SR-053 | Export test cases as CSV / JSON | エクスポート時に期待値カラムを含む |

### 4.7 pict_invocation（SR-060..063） — Parent: UR-001

PICT は外部 CLI として呼ぶ（バンドルしない、[ADR-002](../adr/ADR-002-invoke-pict-as-external-cli.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-060 | Invoke PICT external CLI with DSL-derived input file | 子プロセス spawn、stdout 取得、エラーハンドリング |
| SR-061 | Configure PICT executable path | ユーザ設定で path 指定、永続化 |
| SR-062 | Configure generation order N | N=2 が既定（pairwise）。`/o:N` で渡す |
| SR-063 | Parse PICT output into test case data | TSV → テストケースレコード |

### 4.8 persistence（SR-070..071） — Parent: UR-001, UR-002, UR-005, UR-006

`.tmodel` 単一ファイルでプロジェクト保存（[ADR-009](../adr/ADR-009-tmodel-file-extension.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-070 | Save project as .tmodel file | DSL + 期待値（stable id 付き）+ ビュー状態 + PICT 設定（N） |
| SR-071 | Load project from .tmodel file | 復元、forward migration、DSL parse 失敗時は editor で開いて修正可能 |

### 4.9 cli_mode（SR-080..082） — Parent: UR-006

CI/CD 向け headless 実行。GUI と engine 層を共有（[ADR-004](../adr/ADR-004-cli-and-gui-dual-modes.yaml)）。

| ID | Function | 概要 |
|---|---|---|
| SR-080 | Run NeoCombi as CLI consuming .tmodel input | `neocombi generate <input.tmodel>` でテストケースを stdout / file に出力 |
| SR-081 | Exit with deterministic exit codes | 0=success, 1=parse, 2=PICT failure, 3=I/O input, 4=I/O output |
| SR-082 | Run headless without GUI dependencies | display server なしで動作。GUI bundle 未インストールでも CLI 単独動作 |

### 4.10 mask_level（SR-090..092） — Parent: UR-008

mask 水準の authoring 補助。DSL は変更せず、固定トークン `_MASK_` を「mask 水準」として識別する規約と、その水準が結合制約を持たない場合の警告を加える。

| ID | Function | 概要 |
|---|---|---|
| SR-090 | Recognize a level as the mask level via the fixed sentinel value `_MASK_` | 全因子共通の固定文字列 `_MASK_`（case-sensitive、前後アンダースコア込み）を mask 水準として識別。PICT-PAPP の `MASK` 命名継承＋姉妹ツール NeoCEG の MASK 制約との概念リンクを明示。アンダースコアで囲んで「framework-magic name」感を出すと同時に、PICT 識別子規則と完全互換（DSL ソースを直接 PICT へ渡せる、ADR-001 の subset 原則を満たす）。Factor 表で rename 不可（削除＋再追加のみ）、因子あたり最大 1 個 |
| SR-091 | Display mask levels distinctly across level-displaying views | 因子・水準表 / 禁則マトリクス（列ヘッダ）/ coverage マトリクス（行・列ヘッダ）/ テストケース表 の **4 面** で統一的に muted-italic 表示（色 + 字体の 2 チャネル）。値文字列はそのまま `_MASK_`（コピペ・CSV エクスポートで literal 維持）。**DSL エディタは対象外** — 素 textarea ゆえスタイル付与に syntax-highlight エディタ移行が必要で UR-008 のスコープを超える |
| SR-092 | Warn when a mask level has no triggering constraint | `_MASK_` 水準には「いつ `_MASK_` になるか」と「それ以外の場合は `_MASK_` であってはならない」を両方指定する制約式が必要。これが無いと PICT は `_MASK_` を普通の水準として他因子の任意の値とペア被覆し、本来 mask にならないはずの場面で mask 状態のテストケースが生成される。モデル不備として **warning**（severity = warning、PICT 実行はブロックしない）。現在のチェックは「`_MASK_` への束縛が一切無い」場合のみ検知（reverse direction 専用チェックは未実装）。クリックで Factor 行へジャンプ |

## 5. Traceability Matrix（UR ↔ SR）

| UR | Realized by SR |
|---|---|
| UR-001 (Generate pairwise) | SR-050, SR-053, SR-060..063, SR-070, SR-071 |
| UR-002 (Author factors/levels/constraints) | SR-001..003, SR-010..012, SR-020, SR-070, SR-071 |
| UR-003 (Verify forbidden combinations) | SR-030..033 |
| UR-004 (Verify pair coverage) | SR-040..043 |
| UR-005 (Record expected values) | SR-051..053, SR-070, SR-071 |
| UR-006 (CI/CD invocation) | SR-071, SR-080..082 |
| UR-007 (NL → AI → DSL) | （v2 で SR を追加。MVP では SR-020 future_extension のみが将来余地） |
| UR-008 (Mask-level authoring assistance) | SR-090..092 |

## 6. References

### Project documentation
- [`PROJECT_KICKOFF.md`](../PROJECT_KICKOFF.md) — 立ち上げ時のアーキテクチャ判断・文脈
- [`DSL_Grammar_Specification.md`](../DSL_Grammar_Specification.md) — PICT BNF サブセットの EBNF 定義
- [`ADR_Index.md`](../ADR_Index.md) — 全 ADR の索引

### YAML sources
- [`user_requirements.yaml`](user_requirements.yaml) — UR の一次資料
- [`system_requirements.yaml`](system_requirements.yaml) — SR の一次資料

### Architecture Decision Records
- [ADR-001: PICT BNF を最小サブセットとして mirror する](../adr/ADR-001-mirror-pict-bnf-subset.yaml)
- [ADR-002: PICT を外部 CLI として呼び出し、バンドルしない](../adr/ADR-002-invoke-pict-as-external-cli.yaml)
- [ADR-003: AI を内蔵せず、連携は n8n 経由のパススルーに限定する](../adr/ADR-003-no-embedded-ai-n8n-passthrough.yaml)
- [ADR-004: CLI と GUI の二刀流](../adr/ADR-004-cli-and-gui-dual-modes.yaml)
- [ADR-005: DSL 評価器を内製し、禁則ビューを PICT 非依存で計算する](../adr/ADR-005-builtin-dsl-evaluator.yaml)
- [ADR-006: UI を上下 2 ペーンとし、下ペーンはタブ切替式にする](../adr/ADR-006-split-pane-with-tabbed-bottom.yaml)
- [ADR-007: 禁則マトリクスは入力源ではなく、DSL から導出した参照ビューとする](../adr/ADR-007-forbidden-matrix-as-reference-view.yaml)
- [ADR-008: テストケース表に期待値カラムを持ち、再生成跨ぎで保持する](../adr/ADR-008-expected-value-column-in-test-cases.yaml)
- [ADR-009: プロジェクトファイル拡張子を .tmodel とする](../adr/ADR-009-tmodel-file-extension.yaml)
- [ADR-010: PICT-PAPP からの clean-room 再実装](../adr/ADR-010-clean-room-reimplementation-from-pictpapp.yaml)

### External
- [Microsoft PICT — pict.md](https://github.com/microsoft/pict/blob/main/doc/pict.md)
- [PICT-PAPP（前身、GPL-3.0）](https://github.com/sho1884/PICT-PAPP)
- [PICT-PAPP 解説 by 著者（Qiita）](https://qiita.com/sho1884/items/db1662e75dbf84fccc94)
