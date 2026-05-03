# NeoCombi - プロジェクトガイドライン

## プロジェクト概要

**NeoCombi** は、ペアワイズ組み合わせテストと因子・水準・制約の管理を統合した**総合組み合わせテスト設計ツール**です。Microsoft の **PICT**（Pairwise Independent Combinatorial Testing）を内部エンジンとして利用し、その制約言語（IF-THEN-ELSE / `=` `<>` `>` `>=` `<` `<=` / AND / OR / NOT / LIKE / IN）を一級構文として扱います。

著者の旧 Excel VBA ツール **PICT-PAPP** を React + TypeScript で再構築したもので、HAYST 法 100〜300 因子規模の実務に耐える設計を目標とします。

姉妹ツール：
- **[NeoCEG](https://github.com/sho1884/NeoCEG)** — 原因結果グラフ（CEG）専用の test design tool
- **[ModelLogue](https://github.com/sho1884/ModelLogue)** — AI 支援レビュープラットフォーム

NeoCEG / NeoCombi は決定論変換器（AI を内蔵しない）。ModelLogue がそれら CLI 出力を model-type plug-in として呼び出し AI レビューを提供する、という 3 兄弟構成（[`Doc/PROJECT_KICKOFF.md`](Doc/PROJECT_KICKOFF.md) 参照）。

## 作業方針

### ドキュメント・ファースト

- 十分なドキュメント（要求仕様書・アーキテクチャ設計書）が完成し、**ユーザーと合意するまで**、本番のコーディングは開始しない
- ドキュメントの変更を常に実装より先行させる
- 重要な技術的判断は ADR として記録する（`Doc/adr/` 配下の YAML、`Doc/ADR_Index.md` は自動生成のビュー）。ADR の作成・更新は `adr` スキル経由で行う
- ドキュメントは `Doc/` ディレクトリに格納する
- 企画・参考資料は `Reference/` ディレクトリに格納する

### ディレクトリ構成（計画）

```
NeoCombi/
├── CLAUDE.md                   # 本ファイル
├── LICENSE                     # MIT License
├── README.md
├── Doc/
│   ├── PROJECT_KICKOFF.md      # 立ち上げ時のアーキテクチャ判断・文脈引き継ぎ
│   ├── requirements/
│   │   ├── user_requirements.yaml
│   │   ├── system_requirements.yaml
│   │   └── Requirements_Specification.md
│   ├── DSL_Grammar_Specification.md  # PICT BNF を mirror した DSL の仕様
│   ├── Algorithm_Design.md
│   ├── ADR_Index.md            # adr スキルで自動生成
│   └── adr/
│       └── template.yaml
├── src/                        # 本番ソースコード（次セッションで scaffold）
└── tests/
```

## Documentation Standards

### Language Policy

| What you are writing | Language |
|----------------------|----------|
| Source code comments | English |
| Commit messages | English |
| YAML requirements data | English |
| Markdown specifications (`Doc/`) | Bilingual (English + Japanese) |
| Code review discussion | Japanese |
| DSL keywords (PICT-derived) | English only (`IF`, `THEN`, `ELSE`, `AND`, `OR`, `NOT`, `LIKE`, `IN`) |
| UI strings (i18n) | Both EN and JA via i18next |

### Writing Style (Value Engineering)

- User Requirements: Task expressions ("Design a pairwise test set")
- System Requirements: Verb + Object ("Parse PICT-style DSL")
- Rule Scenarios: Context → Action → Outcome (not Gherkin)

## 技術スタック（計画 — 次セッションで scaffold）

NeoCEG と同等構成を予定：

| レイヤー | 技術 |
|---------|------|
| UI Framework | React 19 |
| Language | TypeScript (strict mode) |
| Build Tool | Vite |
| State Management | Zustand |
| Testing | Vitest |
| i18n | i18next |
| Deployment | Vercel (PWA 検討) |

## 設計原則

### AI 不使用（NeoCEG と同様）

NeoCombi は決定論変換器として設計し、内部に AI を持ち込まない。AI レビューが必要な場合は ModelLogue 経由で行う。これにより：

- CI/CD パイプラインから決定論的に呼び出せる（CLI モード）
- 同じ入力から常に同じ出力（再現性）
- AI 依存のレイテンシ・コスト・信頼性問題を持ち込まない

### PICT BNF を尊重

NeoCombi の DSL は PICT 制約言語を mirror（基本 1:1 マッピング）。これにより：

- ユーザは PICT のドキュメントをそのまま参照可能
- 既存 PICT 知見の継承
- 内部で PICT を呼ぶときの変換が薄い

NeoCEG の制約語彙（ONE / EXCL / INCL / REQ / MASK）とは**意図的に別物**。両者は同じ問題領域（factor/level/constraint）に対し、異なる出口（CEG vs pairwise）を持つ兄弟ツールとして役割分担する。

### CLI と GUI の二刀流

NeoCEG と同じく：
- **GUI**：個人 authoring、即時プレビュー、PICT 実行、結果確認
- **CLI**：CI/CD パイプライン向け UNIX フィルタ（`.tmodel` ファイル → CSV / SVG）

## コーディング規約（計画）

- 言語: TypeScript（strict mode）
- コンポーネント: 関数コンポーネント + Hooks
- 状態管理: Zustand
- CSS: Tailwind CSS（NeoCEG / ModelLogue と統一）

## Security

> セキュリティ要件のレベルは兄弟プロジェクト（NeoCEG / ModelLogue）と統一する。

### Policy

- Follow OWASP Top 10 (latest version) guidelines

### Key Rules

- **Never use `eval()` or `Function()` with user input**
- **Never use `dangerouslySetInnerHTML` with user input**
- Validate all DSL input through parser (no direct execution)
- Sanitize factor / level / expected-value strings before rendering
- 外部 PICT 呼び出し時は引数のサニタイズに注意（コマンドインジェクション防止）。`spawnSync` の引数配列で渡し、シェル経由はしない
- Keep dependencies updated (`npm audit`)

### Vercel Best Practices

- Security headers configured in `vercel.json`（CSP / X-Frame-Options / Strict-Transport-Security / Referrer-Policy）
- HTTPS enforced (automatic)
- No secrets in code — use environment variables

### AI-Generated Code Risks

When using AI assistance for code generation:
- **Verify all suggested dependencies** before installing (check npm registry, GitHub stars, last update date)
- **Never blindly trust AI-suggested URLs or external resources**
- **Review generated code for injection vulnerabilities** (eval, innerHTML, SQL, shell commands, command injection in spawn args)
- **Check for supply chain attacks** — verify package names are spelled correctly (typosquatting)
- **Validate security-sensitive logic** — auth, authorization, file I/O paths, PICT argument construction
- Be aware of **prompt injection** in any user input that may be processed by AI (low risk in MVP since AI is OFF by default; revisit when UR-007 lands)

## Licensing

### Project License

- NeoCombi is released under the **MIT License**
- All contributions must be MIT-compatible

### Dependency License Policy

**CRITICAL**: Before adding any new dependency (direct or transitive):
1. **Check the license** — Only MIT, Apache-2.0, BSD-2-Clause / BSD-3-Clause, ISC, BlueOak-1.0.0, or similarly permissive licenses
2. **Avoid GPL/LGPL/AGPL** — These are NOT compatible with MIT for this project
3. **Run `npx license-checker --summary`** after install to verify the full transitive set
4. **Verify package authenticity** — Check npm registry, GitHub stars, last update date (typosquatting defense)
5. **Record in requirements spec** — Dependencies of consequence are listed in `Doc/requirements/system_requirements.yaml`

### Prohibited

- GPL / LGPL / AGPL licensed code（コピーレフト感染）
- Code copied from Stack Overflow or other sources without license verification
- Proprietary or unclear-license packages
- Dependencies with missing or "UNLICENSED" license fields (private packages excepted)

### Vetted Non-Standard License Exceptions

These transitive deps surface non-typical licenses but are vetted as MIT-compatible / acceptable:

| Package | License | Reason |
|---------|---------|--------|
| `argparse` | Python-2.0 | OSI-approved permissive license, MIT-compatible |
| `caniuse-lite` | CC-BY-4.0 | Build-time browser-compat data; not redistributed in bundle |
| `@resvg/resvg-js` (+ platform binary) | MPL-2.0 | Build-only devDep used by `scripts/genIcons.mjs` to rasterize SVG → PNG. Not bundled. MPL-2.0 is file-level copyleft (no project-wide infection); we don't modify the source |

### External Tool Dependency

NeoCombi delegates pairwise generation to **PICT** (Microsoft, MIT License) as an external CLI invoked at runtime. PICT itself is not bundled; users provide it (`apt install pict` / brew / build from source). NeoCombi's role is the **pre/post processor** — DSL editor, result visualizer, CLI wrapper.

## Git Workflow

- Main branch: `master`
- Commit messages: English, descriptive
- AI-assisted commits must include:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
