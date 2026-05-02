# ADR Index — NeoCombi

> **このファイルは自動生成されたビューです。直接編集しないでください。**
> 編集は `Doc/adr/ADR-NNN-*.yaml` に対して行い、`adr` スキルで本ファイルを再生成します。
>
> Generated: 2026-05-02

## Summary

| ID | Title | Date | Status | Summary |
|---|---|---|---|---|
| [ADR-001](adr/ADR-001-mirror-pict-bnf-subset.yaml) | PICT BNF を最小サブセットとして mirror する | 2026-05-02 | proposed | PICT BNF を 1:1 で mirror するが、MVP 採用は最小サブセットに限定する |
| [ADR-002](adr/ADR-002-invoke-pict-as-external-cli.yaml) | PICT を外部 CLI として呼び出し、バンドルしない | 2026-05-02 | proposed | PICT を外部 CLI として実行時に呼び出し、NeoCombi のバンドルには含めない |
| [ADR-003](adr/ADR-003-no-embedded-ai-n8n-passthrough.yaml) | AI を内蔵せず、連携は n8n 経由のパススルーに限定する | 2026-05-02 | proposed | AI ロジックは NeoCombi に内蔵せず、n8n を介した外部パススルーに限定する |
| [ADR-004](adr/ADR-004-cli-and-gui-dual-modes.yaml) | CLI と GUI の二刀流（エンジン層を共有） | 2026-05-02 | proposed | GUI と CLI の両方を提供。共通エンジン層（DSL parser / evaluator / PICT 連携）を共有する |
| [ADR-005](adr/ADR-005-builtin-dsl-evaluator.yaml) | DSL 評価器を内製し、禁則ビューを PICT 非依存で計算する | 2026-05-02 | proposed | DSL の semantic evaluator を NeoCombi 自身に実装し、禁則表は内製評価器のみで計算する |
| [ADR-006](adr/ADR-006-split-pane-with-tabbed-bottom.yaml) | UI を上下 2 ペーンとし、下ペーンはタブ切替式にする | 2026-05-02 | proposed | UI を上下 2 ペーンに分け、下ペーンは「因子水準 / DSL / テストケース」のタブ切替とする |
| [ADR-007](adr/ADR-007-forbidden-matrix-as-reference-view.yaml) | 禁則マトリクスは入力源ではなく、DSL から導出した参照ビューとする | 2026-05-02 | proposed | DSL を一次入力源とし、禁則マトリクスは DSL から導出する参照ビュー（read-only）とする |
| [ADR-008](adr/ADR-008-expected-value-column-in-test-cases.yaml) | テストケース表に期待値カラムを持ち、再生成跨ぎで保持する | 2026-05-02 | proposed | テストケース表に期待値カラムを持ち、再生成跨ぎで stable id によって期待値を保持する |
| [ADR-009](adr/ADR-009-tmodel-file-extension.yaml) | プロジェクトファイル拡張子を .tmodel とする | 2026-05-02 | proposed | プロジェクトファイル拡張子を .tmodel（test model）に決定する |
| [ADR-010](adr/ADR-010-clean-room-reimplementation-from-pictpapp.yaml) | PICT-PAPP からの clean-room 再実装 | 2026-05-02 | proposed | PICT-PAPP の VBA ソースは行レベルで一切参照せず、clean-room で再実装する |

---

## ADR-001 — PICT BNF を最小サブセットとして mirror する

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi の制約 DSL の文法をどう設計するかの判断。候補は (a) PICT 制約言語をそのまま 1:1 で mirror、(b) NeoCEG と同じ独自語彙（ONE/EXCL/INCL/REQ/MASK）を採用、(c) 完全独自 DSL を新設、の 3 つ。対象ユーザは HAYST 法の現場で PICT に親しんだ層が中心であり、PICT を内部エンジンとして呼び出す方針も既に決まっている（ADR-002 参照）。一方 PICT BNF は LIKE / サブモデル / weight / negative value など冗長または生成方略寄りの構文も含むため、すべてを採用すると評価器・UI ともに肥大化する。

### Decision

**PICT BNF を 1:1 で mirror するが、MVP 採用は最小サブセットに限定する**

NeoCombi の DSL は PICT 制約言語の構文を一文字も変えずに mirror することにした。ただし MVP の採用範囲は意味論的に必要な最小サブセットに限定する：採用は IF/THEN/ELSE、比較演算子（=, <>, >, >=, <, <=）、AND/OR/NOT、IN { }、パラメータ宣言。落とすのは LIKE、サブモデル（{f1,f2}@N）、weight、negative value（~）。LIKE は実装コストが高くワイルドカードマッチが MVP の評価器に重い。サブモデル / weight / negative value は制約意味論ではなく PICT の生成方略チューニングであり、内製評価器の責務外。これらは v2 以降で個別に追加可否を判断する。EBNF として独立定義し（Doc/DSL_Grammar_Specification.md）、PICT BNF からの差分（捨てた要素）を明示的に記載する。

### Neglected Options

- **PICT BNF を全構文採用** — 実装コストが MVP の人員・期間で回収できない。LIKE と submodel は特に重い
- **NeoCEG 独自語彙（ONE/EXCL/INCL/REQ/MASK）を採用** — PICT 親しみのあるユーザ層に追加学習コストを強いる。PICT 入力への変換も厚くなる
- **完全独自 DSL を新設** — 学習コスト最大、利点なし

### Consequences

**Positive:**
- PICT 公式ドキュメントを NeoCombi ユーザがそのまま参照できる
- MVP 実装スコープが締まり、評価器も最小実装で済む
- AI 生成（UR-007）時のターゲット文法が単純で、生成成功率が上がりやすい

**Negative:**
- PICT で書ける一部のテストモデルが NeoCombi MVP では表現不能（LIKE 依存など）
- ユーザが採用外構文を書いた場合は 'unsupported in MVP' エラーで止まる（学習が必要）

**Risks:**
- v2 で LIKE / submodel を追加したとき、評価器の API 互換が崩れる可能性
- PICT が将来の version で構文を拡張した場合、追従判断が都度必要になる

---

## ADR-002 — PICT を外部 CLI として呼び出し、バンドルしない

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi の pairwise / N-wise 生成アルゴリズムをどう実装するか。候補は (a) NeoCombi に PICT バイナリをバンドル、(b) 外部 CLI として実行時呼び出し（ユーザが別途インストール）、(c) 自前実装、の 3 つ。NeoCombi 自身は決定論変換器であり、生成エンジンの再発明は MVP のスコープ外。

### Decision

**PICT を外部 CLI として実行時に呼び出し、NeoCombi のバンドルには含めない**

NeoCombi は PICT を spawn する子プロセスとして扱い、stdout を parse する形で結果を取得する（SR-060..063）。PICT 本体はユーザがプラットフォームに応じて事前にインストールする：Linux: `apt install pict` または source ビルド、macOS: `brew install pict`、Windows: 公式 GitHub から DL。NeoCombi の設定 UI で PICT 実行可能ファイルへのパスを指定する（SR-061）。CLI モードでも同じ engine 層を共有するため挙動は GUI / CLI で一致する（ADR-004）。

### Neglected Options

- **PICT バイナリをバンドル** — プラットフォーム別バイナリの管理コスト、PICT 更新の追従負担、配布サイズ増、再配布の表記責任が発生する
- **pairwise アルゴリズムを自前実装** — PICT は数十年の実装・チューニング蓄積があり、再実装は MVP のスコープを外れる
- **別の pairwise ツール（CIT-BACH 等）を採用 / 同梱** — PICT-PAPP のユーザ層がそのまま PICT に親しんでいる。複数ツール対応は v2 以降

### Consequences

**Positive:**
- ユーザは PICT の最新版を独立して使える
- NeoCombi の配布サイズが小さい
- PICT 本体のメンテ負担が NeoCombi に来ない

**Negative:**
- ユーザがインストール手順を踏む必要がある（GUI で path 設定 UI を提供）
- PICT が見つからない / 実行不能なときのエラーハンドリング設計が必要

**Risks:**
- ユーザ環境の PICT バージョン違いによる挙動差
- Windows ユーザは公式 GitHub からの手動 DL が必要で、心理的障壁になる可能性

---

## ADR-003 — AI を内蔵せず、連携は n8n 経由のパススルーに限定する

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi の AI 機能をどう扱うか。最終ビジョン（UR-007）では自然言語要求仕様 → AI → DSL のレビュー駆動オーサリングを目指すが、AI を本体に内蔵すると CI/CD の決定論性、レイテンシ、コスト、プロバイダ依存等が崩れる。兄弟ツール ModelLogue は同じ問題に対し「AI ロジックを内蔵せず n8n でパススルー」で対応しており、運用ノウハウが共有可能。

### Decision

**AI ロジックは NeoCombi に内蔵せず、n8n を介した外部パススルーに限定する**

本体は決定論変換器のまま据え置き、AI 連携は n8n エンドポイントへの通信という薄いレイヤとしてのみ実装する。連携 OFF では NeoCEG と区別がつかない単独動作、連携 ON では右ペーンにチャット、下ペーンに「自然言語要求仕様」タブが追加される（SR-020 future_extension）。MVP では n8n 連携の通信仕様は保留し、ModelLogue の連携実装が成熟したら同パターンに追従する。AI モデル名・プロンプト戦略・コスト試算は NeoCombi リポジトリでは管理しない（n8n ワークフロー側の責務）。

### Neglected Options

- **OpenAI / Anthropic などの SDK を直接 NeoCombi に組み込む** — プロバイダ依存とコスト管理を本体が抱える。CI/CD 利用との両立が崩れる
- **AI 機能を一切持たない** — 最終ビジョン（UR-007）の自然言語 → DSL 生成が実現できない
- **外部 AI を独自に呼び出すサーバを NeoCombi に持つ** — n8n がすでに同じ役割を ModelLogue で担っており、車輪の再発明

### Consequences

**Positive:**
- 本体ロジックが AI フリーで決定論的、CLI モードでも安定稼働
- AI プロバイダ切替・プロンプト改善が n8n 側で完結
- ModelLogue と運用知見が共有できる

**Negative:**
- ユーザは AI 機能を使うために n8n をセットアップする必要がある
- MVP では実機能化されないため UR-007 はビジョン記述のみ

**Risks:**
- ModelLogue の連携実装が成熟するまで、最終ビジョンが未検証のまま MVP が進む
- n8n 自体の運用 / トラブルシューティングが、ユーザに新しい知識を要求する

---

## ADR-004 — CLI と GUI の二刀流（エンジン層を共有）

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi は個人 authoring 用の即時プレビュー機能と、CI/CD パイプラインからの決定論的呼び出しの両方が必要。GUI のみ・CLI のみ・両方提供のいずれを取るか。PICT-PAPP は実質 Excel 限定で CI/CD 統合できなかった反省がある。

### Decision

**GUI と CLI の両方を提供。共通エンジン層（DSL parser / evaluator / PICT 連携）を共有する**

NeoCombi をエンジン層 + GUI 層 + CLI 層の 3 レイヤで構築する。エンジン層は DSL parse、内製評価器、PICT 連携、出力整形を担い、GUI / CLI のどちらからも同じインターフェースで呼ばれる。CLI は GUI に依存せず headless 環境（CI ランナー）で起動可能（SR-082）。GUI は React アプリとして配布、CLI は同じ TypeScript コードベースから別 entry point として bundle する（NeoCEG と同じ構成、PROJECT_KICKOFF.md §7 / §8 のディレクトリ計画と一致）。決定論的 exit code を CLI に持たせる（SR-081）。

### Neglected Options

- **GUI のみ提供（CLI は省略）** — PICT-PAPP も実質 Excel 限定だった反省。CI/CD 統合できないと組織導入が困難
- **CLI のみ提供** — 個人 authoring の UX が貧弱。HAYST 法の試行錯誤に向かない
- **GUI と CLI を別コードベースで実装** — DSL parser / evaluator の重複維持コスト、挙動ドリフトのリスク

### Consequences

**Positive:**
- 個人と CI/CD 両方のユースケースをカバー
- エンジン層の振る舞いが GUI / CLI 間で一致（決定論性の保証）
- CI で .tmodel をテスト・回帰検出できる

**Negative:**
- ビルド構成が 2 つ（GUI / CLI）必要、tsconfig も分離
- 依存関係を慎重に分離する必要（CLI が GUI 関連 dep を引き込むと headless で動かない）

**Risks:**
- GUI と CLI で機能差が広がると、ユーザが混乱する可能性
- エンジン層の API 変更時、両 entry point を同時メンテする必要

---

## ADR-005 — DSL 評価器を内製し、禁則ビューを PICT 非依存で計算する

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

禁則の参照ビュー（多項間禁則表）の計算をどこで行うか。候補は (a) PICT に DSL を渡して結果を逆算、(b) NeoCombi 自身が DSL 評価器を実装、の 2 つ。前者は PICT のプロセス起動・ファイル I/O が編集ごとに発生し、レスポンス性が悪く、PICT 結果の挙動変動にも依存する。

### Decision

**DSL の semantic evaluator を NeoCombi 自身に実装し、禁則表は内製評価器のみで計算する**

NeoCombi は DSL parser に加え、AST を評価する semantic evaluator を持つ。ユーザが N（>=2）と「条件因子 N-1 個 + 被制約因子 1 個」のスライスを選ぶと、評価器がスライス内の全水準組合せを列挙し、各組合せに対し DSL の制約を評価して禁則 / 許可を判定する（SR-030..031）。PICT は呼び出さない。対応構文は MVP の DSL サブセット（ADR-001）と一致：=, <>, >, >=, <, <=, AND/OR/NOT, IF/THEN/ELSE, IN { }。LIKE / submodel / weight / negative value は対象外。一方、テストケース生成は引き続き PICT が担う（ADR-002）。つまり「DSL → 禁則表」は内製、「DSL → テストケース」は PICT、という二経路。

### Neglected Options

- **PICT に DSL を渡し、結果を逆算して 2D マトリクスに表示** — 編集ごとの PICT 起動はレイテンシが大きく、即時フィードバックにならない。また PICT 結果の挙動変動に依存する非決定論性が生じる
- **禁則ビューを提供せず、ユーザが PICT 出力を見て手作業確認** — PICT-PAPP からの主要モダナイズポイントが失われる。HAYST 規模で破綻
- **PICT BNF 全構文を評価器対応** — MVP の実装スコープを超える。LIKE は特に重い

### Consequences

**Positive:**
- 編集中のリアルタイム禁則可視化が可能
- 決定論的（同じ DSL → 同じ禁則集合）
- PICT の挙動変動から本ビューが独立

**Negative:**
- DSL parser に加えて evaluator を実装する追加コスト
- PICT との挙動一致をテストで担保する必要（同じ DSL → 同じ禁則）

**Risks:**
- PICT が将来の version で意味論を微変更した場合、評価器との整合性検証が再び必要
- 大規模因子（HAYST 100〜300 因子）でのスライス計算量が問題化する可能性 → 早期にプロファイリング

---

## ADR-006 — UI を上下 2 ペーンとし、下ペーンはタブ切替式にする

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

GUI のレイアウトをどう構成するか。PICT-PAPP は Excel シート切替式で、画面分割という概念が薄かった。NeoCombi は上下分割案（上：総当たり表、下：因子水準表 / DSL / テストケース）が自然と思われるが、将来 AI 連携で「自然言語要求仕様」タブが追加される（UR-007）ことを考慮する必要がある。また下ペーンの 3〜4 領域を一度に並べるか、タブで切り替えるかも選択肢。

### Decision

**UI を上下 2 ペーンに分け、下ペーンは「因子水準 / DSL / テストケース」のタブ切替とする**

上ペーンは総当たり表 / 多項間禁則表（参照ビュー）を表示するエリア（SR-040..043、SR-030..033）。各因子の行にチェックボックスを置き、表示対象因子を絞れる（SR-041）。下ペーンは「因子水準 / DSL / テストケース」の 3 タブをタブヘッダで切替（SR-020）。将来 AI 連携 ON 時に「自然言語要求仕様」タブが追加されて 4 タブに拡張可能（タブコンテナを最初から可変要素数前提で設計）。AI 連携 ON 時はさらに右ペーンにチャットを表示する。タブ切替を採用した理由は (1) 100〜300 因子で各領域に十分な画面幅を確保するため、(2) 複数領域並列表示は同時に見たい場面が少なく、視認性が下がるため。

### Neglected Options

- **下ペーンを 4 分割（縦 2 × 横 2）で常時並列表示** — 100〜300 因子の HAYST 規模では各領域が狭くなり読みにくい。リサイザー多用は UX 後退
- **アコーディオン式（折りたたみ）** — 領域切替の操作が暗黙的で、タブほど明確ではない
- **上ペーンを廃し、すべてを下ペーンタブに統合** — 総当たり表は『編集と並行して常時見たい』用途であり、タブに隠すと UX を損なう

### Consequences

**Positive:**
- 100〜300 因子規模で視認性を確保
- AI 連携時の 4 タブ拡張がレイアウト破綻なく可能
- 上ペーンと下ペーンの責務が明確（可視化 vs 編集）

**Negative:**
- 下ペーン内で「因子水準」と「テストケース」を見比べたいときはタブ切替が必要
- タブ切替の状態を .tmodel に保存する必要

**Risks:**
- AI 連携 ON / OFF 切替で右ペーン・タブセットが変動するため、レイアウト遷移の実装が複雑になる可能性

---

## ADR-007 — 禁則マトリクスは入力源ではなく、DSL から導出した参照ビューとする

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

PICT-PAPP では禁則マトリクスに「×」を直接入力し、Step2 で逆方向に DSL（PICT 入力）を生成していた。NeoCombi の MVP でも同様の入力 UX を踏襲するか、それとも DSL 入力を一次として禁則マトリクスを参照ビューに格下げするか。

### Decision

**DSL を一次入力源とし、禁則マトリクスは DSL から導出する参照ビュー（read-only）とする**

ユーザは制約を DSL 文法で直接書く（SR-001..003）。禁則マトリクスは内製評価器（ADR-005）が DSL から計算する extensional 表現で、ユーザがマトリクスのセルを直接編集することはできない。マトリクスは「DSL の意図通りに禁則が出ているか」の検証用途で、編集の操作可能性を取り除くことで DSL とマトリクスが食い違う状態を構造的に発生させない。PICT-PAPP の Step2「マトリクス → DSL 自動生成」は MVP では提供しない。なお HAYST 法の現場で「マトリクス入力に慣れている」ユーザがいる可能性は認識しているが、DSL の学習コストは PICT 公式ドキュメントを参照可能（ADR-001）であり、追加負担は限定的。

### Neglected Options

- **PICT-PAPP 同様、マトリクス入力 → DSL 自動生成の双方向同期** — 実装複雑度高く、双方向同期の整合性バグが発生しやすい。MVP のスコープを超える
- **マトリクスを完全に廃止** — DSL の制約意図が正しく N 因子組合せに反映されているかの確認手段が失われる

### Consequences

**Positive:**
- DSL ↔ マトリクスの整合性が構造的に保証される（一方向）
- 実装複雑度が下がる（双方向同期不要）
- AI 生成 DSL のレビューフロー（UR-007）と整合

**Negative:**
- PICT-PAPP のマトリクス入力 UX に慣れたユーザは DSL 直書きに移行する必要
- 視覚的に禁則を組み立てる操作感は失われる

**Risks:**
- DSL 直書きへの心理的障壁が PICT-PAPP からの移行を阻害する可能性

---

## ADR-008 — テストケース表に期待値カラムを持ち、再生成跨ぎで保持する

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

PICT が生成するテストケースには「入力組合せ」だけがあり、期待値（出力 / 判定基準）は含まれない。実務では各テストケースに対して期待値を別途記入する必要がある。PICT-PAPP は期待値カラムを持たず、ユーザは別シートで管理していた。一方 NeoCombi では DSL 編集 → PICT 再生成のサイクルが頻繁に発生し、再生成のたびに期待値がリセットされると実用にならない。

### Decision

**テストケース表に期待値カラムを持ち、再生成跨ぎで stable id によって期待値を保持する**

PICT 生成結果に期待値カラムを追加し、ユーザが各行に自由テキストで期待値を入力できる（SR-051）。再生成時、各テストケース行を「factor / level の組み合わせ」をキーとした stable id で識別し、再生成前後で同じ id の行の期待値を引き継ぐ（SR-052）。stable id は表示名ではなく内部 id ベースで、factor / level が改名されても期待値が維持される。新規行は期待値が空、削除された行の期待値は silently 破棄（undo で復元可能）。.tmodel ファイルにも期待値を stable id 付きで保存する（SR-070）。CSV / JSON エクスポートにも期待値カラムを含める（SR-053）。

### Neglected Options

- **期待値カラムを持たない（PICT-PAPP と同じ）** — 実務で必須機能、別シート / 別ツール管理は再生成と整合せず非実用
- **再生成のたびに期待値をリセット** — DSL 編集サイクルで期待値が失われ、ユーザが入力を躊躇する
- **行番号で期待値を紐づけ** — PICT 出力の行順は決定論だが、DSL 変更で行構成が変動する。行番号紐づけは fragile

### Consequences

**Positive:**
- テストケースが入力 + 期待値の完全な単位として扱える
- DSL 編集サイクルが現実的に高速化（期待値が失われない）
- PICT-PAPP と比較した明確な機能向上

**Negative:**
- stable id の生成・保持・migration 設計が必要
- .tmodel フォーマットが期待値分だけ複雑化

**Risks:**
- factor / level の大規模変更時に stable id の解釈が曖昧になる可能性 → migration ルールを早期に策定

---

## ADR-009 — プロジェクトファイル拡張子を .tmodel とする

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi のプロジェクトファイル（DSL + 期待値 + ビュー状態を含む）の拡張子をどう決めるか。候補として .ncombi, .combi, .pict, .pwise, .cit, .tmodel などが挙がった。当初提案の .ncombi は (1) 長い、(2) 'n-' プレフィックスが否定接頭辞のように読めて 'combi（組合せ）を否定』と解釈されうる、という指摘がユーザから入った。

### Decision

**プロジェクトファイル拡張子を .tmodel（test model）に決定する**

ファイルが保持する内容は組合せ（テストケース）そのものではなく、組合せを導出する因子・水準・制約関係の model である（テストケースは PICT が都度生成する派生物でファイルには記録されない、SR-070）。よって拡張子は組合せを示唆する `combi` 系では意味論的に不正確であり、より忠実な表現として PICT 自身も使う "model" という語を採用する。.tmodel（test model）は (1) 因子・水準・制約を記述する model という性格に忠実、(2) PICT 文化圏で "model" が通用する語、(3) 否定読み・短すぎ・他フォーマット衝突なし、という 3 点で選択した。

### Neglected Options

- **.ncombi** — n + combi で『combi（組合せ）を否定』と読まれうる。長い
- **.combi** — ファイル内容は組合せそのものではなく、因子・水準・制約の model。意味論的に不正確
- **.pict** — Apple 旧画像形式 PICT との衝突。NeoCombi project file は raw PICT input より richer で誤解を招く
- **.pwise** — pairwise だけでなく N-wise も扱える。pairwise 由来は将来の意味的ズレを生む
- **.cit** — Combinatorial Interaction Testing の略として正確だが、英語圏で 'citation' と読まれる懸念

### Consequences

**Positive:**
- 意味論的に正確（組合せではなく model）
- PICT 用語と整合し、ユーザの語彙体系に乗る
- 他フォーマットと衝突しない

**Negative:**
- 5 文字で短くはない（.cit などより 2 文字長い）
- test model という語は CT 業界外には馴染みが薄い

**Risks:**
- 将来 NeoCEG 側のファイル拡張子（現在 .nceg）との対称性が崩れる（NeoCEG が .cegmodel に揃える可能性は別判断）

---

## ADR-010 — PICT-PAPP からの clean-room 再実装

- **Date:** 2026-05-02
- **Status:** proposed
- **Author:** sho1884 / **Approver:** sho1884

### Context — Problem

NeoCombi は著者 sho1884 自身の旧 Excel VBA ツール PICT-PAPP の機能的後継として位置づけられる。PICT-PAPP は GPL-3.0 ライセンス、NeoCombi は MIT ライセンスで公開予定。GPL コードを MIT プロジェクトに混入させるとプロジェクト全体が GPL に感染する。さらに AI 補助開発下では「VBA をちょっと参考に」が容易に GPL 感染の事故を起こす。

### Decision

**PICT-PAPP の VBA ソースは行レベルで一切参照せず、clean-room で再実装する**

NeoCombi の実装にあたり、PICT-PAPP の VBA ソース（src/PICT-PAPP.xlsm/*.bas）は読み込み・引用・模写のいずれも禁止。許される参照源は以下のみ：(1) 著者 sho1884 自身による Qiita 解説記事（https://qiita.com/sho1884/items/db1662e75dbf84fccc94）、(2) README、画面キャプチャ、サンプル xlsm を Excel で動かして得る挙動観察、(3) 著者本人（リポジトリオーナー）からのチャット指示。VBA モジュール名（`制約式生成.bas` 等）は機能カタログとして利用してよいが、コードの中身は開かない。挙動の不明点が発生したら「ソースを読む」のではなく「ユーザに聞く」「サンプル xlsm を Excel で動かして観察する」を優先する。本ルールは memory にも保存済み（`license_pictpapp_cleanroom.md`）。

### Neglected Options

- **PICT-PAPP の VBA ロジックを TS / React に翻訳** — GPL 感染で NeoCombi 全体が GPL 化する。MIT 公開方針と矛盾
- **NeoCombi も GPL-3.0 で公開** — 兄弟ツール NeoCEG / ModelLogue が MIT で、ライセンス分裂は配布・統合の障害
- **PICT-PAPP の挙動を一切参考にせず、ゼロから再設計** — PICT-PAPP のユーザ層に対する機能的同等性が損なわれ、移行が促進されない

### Consequences

**Positive:**
- MIT ライセンスを維持しつつ、PICT-PAPP の概念・UX を継承可能
- PROJECT_KICKOFF.md §10 の方針が運用ルールとして明文化される
- AI 補助開発時の GPL 事故リスクが構造的に低減

**Negative:**
- 細かい挙動の確認が VBA を読めば即解決する場合でも、毎回 Excel で動作確認が必要
- ユーザへの質問回数が増える

**Risks:**
- 意図せず VBA を読みに行く誘惑が将来発生する可能性 → memory に記録、頻繁にチェック
