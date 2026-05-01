# NeoCombi — Project Kickoff Handoff

> このドキュメントは NeoCombi プロジェクトの立ち上げ時点での **アーキテクチャ判断と文脈** を、次の Claude Code セッション（および将来の自分・コラボレータ）へ引き継ぐためのものです。
> ここに書かれているのは「決定」と「決定の理由」と「保留」だけです。仕様の本体は `Doc/requirements/`、技術判断の蓄積は `Doc/adr/` 配下に分けて持ちます。

## 1. 目的（What is NeoCombi?）

**NeoCombi** = Neo + Combinatorial。
ペアワイズ組み合わせテストと因子・水準・制約の管理を統合した **総合組み合わせテスト設計ツール**。

- 旧 Excel VBA ツール **PICT-PAPP**（Microsoft PICT を VBA から呼ぶラッパー）の現代化版
- 対象規模：HAYST 法 100〜300 因子の実務利用に耐えること
- 内部エンジンは **Microsoft PICT**（pairwise.exe）— ランタイムに外部 CLI として呼び出す（バンドルしない）
- DSL は **PICT 制約言語を 1:1 で mirror**（ユーザは PICT 公式ドキュメントをそのまま参照可能）

## 2. 3 兄弟アーキテクチャ

NeoCombi は単独ツールではなく、3 つの兄弟プロジェクトの一員として位置づけられます。

```
┌─────────────────────────────────────────────────────────┐
│ ModelLogue（AI 支援レビュープラットフォーム）             │
│   - model-type plug-in 経由で各種モデルを取り込む        │
│   - レビューは AI 対話 + マーカーで実施                  │
└─────────────────────────────────────────────────────────┘
            ▲                         ▲
            │ plug-in 呼び出し        │ plug-in 呼び出し
            │ （CLI 経由 / 決定論的）  │
            │                         │
┌───────────────────────┐   ┌───────────────────────────┐
│ NeoCEG                │   │ NeoCombi                  │
│ - 原因結果グラフ      │   │ - ペアワイズ + 因子水準   │
│ - 制約: ONE/EXCL/    │   │ - 制約: PICT BNF を mirror │
│   INCL/REQ/MASK       │   │   (IF/THEN/ELSE, =/<>...) │
│ - DSL → CEG model     │   │ - DSL → factor/level model│
│ - CLI + GUI           │   │ - PICT 呼び出し → CSV     │
│ - AI 不使用           │   │ - CLI + GUI               │
└───────────────────────┘   │ - AI 不使用                │
                             └───────────────────────────┘
```

### 役割分担の原則

- **NeoCEG / NeoCombi**：決定論変換器。AI を内蔵しない。同じ入力 → 同じ出力。CI/CD で再現可能。
- **ModelLogue**：AI レビュー専用の上位プラットフォーム。CEG / 要求図 / 状態遷移図 / pairwise 結果などを model-type plug-in として取り込み、AI 対話と提案 Apply/Undo を提供する。
- 3 つは **同じ問題領域（factor / level / constraint）** を扱うが、出口が違う：
  - NeoCEG → 原因結果グラフ（網羅性の可視化）
  - NeoCombi → pairwise テストケース表（実行可能なテスト）
  - ModelLogue → AI レビューログ（設計判断の資産化）

## 3. なぜ NeoCEG に統合しなかったのか（重要判断）

過去の議論で 3 案を比較しました：

1. **NeoCEG に統合**：因子・水準・制約モデルが共通だから一見筋が良い。だが NeoCEG は「内部に AI を持たない」前提で設計されている。NeoCombi も同じ前提なので **AI の有無では分離理由にならない**。
2. **NeoCombi が NeoCEG CLI を呼び出す**：PlantUML Server を呼ぶような外部依存パターン。これは可能だが、PICT 制約言語と NeoCEG 制約語彙（ONE/EXCL/INCL/REQ/MASK）は **意図的に違う表現** であり、相互変換は薄くない。
3. **完全に別プロジェクト（採用）**：DSL、UX、出口（CEG vs CSV）が違う。同じ概念を 2 つの語彙で扱うのは自然。両者ともに ModelLogue から plug-in として呼ばれる対称構造になる。

→ **採用：3。** ただし UI コンポーネント・テックスタック・ディレクトリ構成は NeoCEG と揃え、操作感のばらつきを最小化する（後述 §6）。

## 4. なぜ PICT BNF を mirror するのか

NeoCEG は独自語彙（ONE/EXCL/INCL/REQ/MASK）を採用しています。NeoCombi はこれと違い、**PICT 制約言語を 1:1 で mirror** します。

### 採用根拠

- ユーザは PICT の公式ドキュメント・既存知見をそのまま使える
- 内部で PICT を呼ぶときの変換が薄い（DSL ≒ PICT 入力）
- HAYST 法の現場で PICT に慣れたユーザが多い

### mirror する範囲

- 制約節：`IF ... THEN ... [ELSE ...]`
- 比較演算子：`=` `<>` `>` `>=` `<` `<=`
- 論理演算子：`AND` `OR` `NOT`
- 集合・パターン：`IN { ... }` `LIKE "..."`
- パラメータ宣言、サブモデル、weight、negative value

### NeoCEG 語彙との関係

NeoCEG の制約語彙（ONE/EXCL/INCL/REQ/MASK）は **意図的に別物** として残します。両者は同じ問題領域に対し違う出口を持つので、表現が違うのが自然です。混乱を避けるため、相互変換ツールは **当面提供しない**。

## 5. なぜ AI を内蔵しないのか

NeoCEG と同じ判断：

- **CI/CD パイプラインから決定論的に呼び出せる**（CLI モード）
- **同じ入力 → 同じ出力**（再現性）
- **AI 依存のレイテンシ・コスト・信頼性問題を持ち込まない**
- AI レビューが必要なら **ModelLogue 経由** で行う（plug-in 統合）

## 6. 立ち上げ判断のスナップショット

前セッションでの主要 Q&A：

| Q | 採用 | 理由 |
|---|------|------|
| Q1: スコープ | (b) DSL + EBNF + CLI + GUI の完全スイート | 中途半端な GUI-only / CLI-only は HAYST 規模で破綻する |
| Q2: ModelLogue 統合 | (i) 将来の SR として ModelLogue 側に追加（new UR は作らない） | リポジトリ分離の原則（=URは自分のリポジトリに住む）と整合 |
| 操作感の統一 | NeoCEG とテックスタック・ディレクトリ構成・UI コンポーネントを揃える | 同じ作者・同じユーザ層・同じ問題領域。バラつきは害 |
| Classification tree | **採用しない（無期限保留）** | 因子・水準表のほうが見やすい。PICT 出力の総当たり表で十分 |

## 7. テックスタック（NeoCEG と同等）

| レイヤー | 技術 |
|---------|------|
| UI Framework | React 19 |
| Language | TypeScript (strict mode) |
| Build Tool | Vite |
| State Management | Zustand |
| Testing | Vitest |
| i18n | i18next |
| CSS | Tailwind CSS |
| Deployment | Vercel (PWA 検討) |

## 8. ディレクトリ構成（次セッションで scaffold）

```
NeoCombi/
├── CLAUDE.md
├── LICENSE                              # MIT
├── README.md
├── Doc/
│   ├── PROJECT_KICKOFF.md               # 本ファイル
│   ├── requirements/
│   │   ├── user_requirements.yaml
│   │   ├── system_requirements.yaml
│   │   └── Requirements_Specification.md
│   ├── DSL_Grammar_Specification.md     # PICT BNF mirror の DSL 仕様
│   ├── Algorithm_Design.md
│   ├── ADR_Index.md                     # adr スキルで自動生成
│   └── adr/
│       └── template.yaml                # 既に配置済
├── Reference/                           # 企画書・参考資料（git に上げない PDF など）
├── src/
│   ├── components/
│   ├── engines/                         # PICT input 変換, 結果パーサ
│   ├── services/                        # PICT CLI 呼び出し
│   ├── stores/
│   ├── types/
│   └── grammars/                        # EBNF (PICT BNF mirror)
├── tools/                               # CLI mode 実装
└── tests/
```

## 9. 次セッションで最初にやること

1. **要求仕様の起草**（doc-first を厳守）
   - `Doc/requirements/user_requirements.yaml`：UR-001〜（タスク表現で）
   - `Doc/requirements/system_requirements.yaml`：SR-001〜（Verb + Object）
   - `Doc/requirements/Requirements_Specification.md`：上記の Markdown ビュー
   - **ユーザレビュー＆合意までコーディング着手しない**
2. **DSL 文法の定義**
   - `Doc/DSL_Grammar_Specification.md`：PICT BNF を引用しつつ NeoCombi 独自の追加（ある場合）を明示
   - `src/grammars/pictDsl.ebnf`：strict spec（後で `?raw` import）
3. **ADR の起草**（`adr` スキル経由で）
   - ADR-001：PICT BNF を mirror する判断
   - ADR-002：PICT を外部 CLI として呼び出す（バンドルしない）
   - ADR-003：AI 不使用（NeoCEG と同等の理由）
   - ADR-004：CLI と GUI の二刀流
4. **scaffold 実装**
   - `npm create vite@latest` で React + TS テンプレート
   - NeoCEG の `package.json` を参考に依存を揃える
5. **ModelLogue plug-in 統合の設計（先送り可）**
   - ModelLogue 側に SR として追加（NeoCombi 側ではない）
   - 出力フォーマット（CSV / JSON）と命名規則を先に決める

## 10. 参照資料

### PICT 公式

- リポジトリ：https://github.com/microsoft/pict
- BNF：`pict/doc/pict.md` 内の Constraints セクション

### 兄弟プロジェクト

- NeoCEG：https://github.com/sho1884/NeoCEG
- ModelLogue：https://github.com/sho1884/ModelLogue

### 著者の旧ツール（再構築元）

- PICT-PAPP（Excel VBA）：参考のみ。コードは持ち込まず、思想だけ継承する

## 11. 進め方の原則（前プロジェクトから引き継ぎ）

以下は ModelLogue / NeoCEG での経験から確立した進め方。NeoCombi でも踏襲する：

- **doc-first**：仕様レビュー＆合意 → コーディング着手。spec + code 同時 commit は禁止
- **ADR を都度書く**：重要判断は `adr` スキルで YAML として残す。後から「なぜそうしたか」を辿れる
- **要求は重複させない**：似た UR / SR があれば既存を更新する
- **AC はコンセプトレベル**：細かすぎる AC は実使用しないと評価できない
- **小さくこまめに push**：1 機能 = 1 commit を目標に、push を早める
- **テストは実装と同時に書く**：「あとで埋める」は禁止
- **同じソースを何度も触らない**：cruft / drift / 中途半端なリファクタの温床。試行錯誤は `/tmp` で、本流には 1 回のクリーンパスで入れる

---

*Created at NeoCombi project bootstrap, May 2026.*
