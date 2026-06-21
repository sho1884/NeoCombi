# Changelog

All notable changes to NeoCombi are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once
out of v0.x.

## [Unreleased]

### Added

- **Achieved coverage: count flags + stable IDs + results write-back** (UR-010).
  Every test case now carries a stable, human-readable **ID** (`P01`/`D0001`,
  zero-padded to the case count) and a **Count toward coverage** flag (default
  on). The coverage matrix and rate count only flagged-in cases, so a pair
  covered only by flagged-out cases reads as *missed* — turning "planned"
  coverage into "achieved" coverage. An **Import results…** action writes back a
  fixed three-column `id,count,note` CSV, matched to cases by ID, so an external
  execution system can feed results in.
- **Persisted test set; resume without regenerating** (UR-011). A project saves
  its generated set verbatim (rows, IDs, flags, notes); loading restores it and
  does **not** regenerate. Re-generating, switching mode, clearing, or importing
  results is guarded — it asks first whenever a count flag or note would be lost.

### Changed

- **File format split into `.ncombi` and `.ncproj`** (ADR-014, supersedes
  ADR-009). `.ncombi` is the DSL model alone (shareable, CI-facing); `.ncproj`
  is a full project that also embeds the persisted test set. Both share one
  on-disk grammar; the save content follows the chosen extension. Legacy
  `.tmodel` files still open and save back as projects. The CLI takes a
  `.ncombi` model and always regenerates. Example / sample files renamed to
  `.ncombi`.
- **"Expected" column renamed to "Notes"** (UR-005). The per-case free-text
  column is a design-time memo (annotation key `@neocombi:note`); CSV/JSON
  exports now carry `ID`, `Count`, factor, and `Notes` columns.

- **Decision-table generation** (UR-009). The full Cartesian product of all
  factors with forbidden rows kept and marked (not excluded) — decision-table
  test design, the complement of pairwise. One pure-TypeScript core
  (`generateDecisionTable`) is shared by three deployments, each in its own
  configuration:
  - **GUI** — a generation-mode toggle (Pairwise / Decision table) in the Test
    cases tab; the core runs in-browser (no PICT), forbidden rows shown with a
    marker column and muted styling. Mode persists in the project file.
  - **CLI** — `neocombi generate <model.ncombi> --decision-table`. Atomic output
    (a complete table or nothing); a dedicated exit code `5` for too-large that
    does not collide with PICT's codes.
  - **HTTP API** — `POST /decision-table` on pict-service (beside `/generate`):
    `200` with the table, `400` invalid-model, `413` too-large.
  Refused above 512 combinations. See `Doc/requirements` §4.11 for the
  interfaces and the three configuration diagrams.

## [0.1.0] — 2026-05-03

First public MVP. Six of the seven user requirements
([`Doc/requirements/user_requirements.yaml`](Doc/requirements/user_requirements.yaml))
are realized; UR-007 (natural-language → AI → DSL) is deferred to v2.

### Added

- **DSL authoring** (UR-002). PICT BNF subset — `IF / THEN / ELSE`,
  `=` `<>` `>` `>=` `<` `<=`, `AND` / `OR` / `NOT`, `IN`. Lexer +
  recursive-descent parser with structured diagnostics. The DSL is the
  single source of truth for factors, levels, and constraints.
- **Factors & Levels table** (UR-002). Inline rename, add / remove,
  drag-reorder rows and level chips. Renames automatically rewrite
  `[refs]` in constraints. Per-row Show checkbox + All / None bulk
  toggles control which factors appear in the coverage matrix.
- **Forbidden view** (UR-003). Live forbidden-combination matrix
  computed by a built-in evaluator (no PICT spawn).
  ✨ **Suggest from constraints** proposes slices automatically,
  including *propagation slices* that surface chained restrictions
  across multiple constraints. Free-factor enumeration is scoped to
  the constraint-reachable closure to stay tractable on 100+ factor
  models (ADR-012).
- **Coverage matrix** (UR-004). Single PICT-PAPP "総当たり表"-style
  table showing every factor pair. Upper-right cells show occurrence
  count; lower-left cells show "#firstId +N" with the full id list in
  the tooltip. Forbidden cells, missed cells, and covered cells are
  visually distinguished.
- **Test cases tab** (UR-001 / UR-005). Auto-regeneration via the local
  PICT service whenever the DSL parses cleanly; manual **Re-generate**
  button; **Expected** column persisted in `.tmodel` by stable id so
  expectations survive re-generation.
- **CLI** (UR-006). `neocombi generate <file.tmodel>` runs PICT and
  emits CSV / TSV / JSON with deterministic exit codes
  (0 success, 1 DSL error, 2 PICT failure, 3 input error, 4 output error).
- **`.tmodel` file format**. Plain PICT DSL plus a few `# @neocombi:`
  annotation comments — the file remains a valid PICT input.
  File System Access API on Chrome / Edge with download fallback on
  Firefox / Safari.
- **PWA install**. Web App Manifest, service worker (Workbox), maskable
  icon, apple-touch-icon. The K₅ pairwise-graph favicon scales from
  16px to 512px.
- **Resizable split pane**. Drag the divider between the top and
  bottom panes; double-click to reset to 60 / 40.
- **Multi-format clipboard**. Copy emits `text/html` + `text/plain` so
  Excel / Sheets get a real table, while VS Code / pytest get the
  format selected in the toolbar.
- **CI** (`.github/workflows/ci.yml`). Lint + type-check + tests +
  production build + license audit on every push and PR.
- **License-check npm scripts** (`license:check`, `license:check:all`)
  enforced by CI.
- **Security headers** in `vercel.json` — CSP, HSTS, X-Frame-Options,
  Referrer-Policy, Permissions-Policy.

### Documented

- 12 ADRs covering the core architectural decisions
  ([`Doc/ADR_Index.md`](Doc/ADR_Index.md)) — PICT BNF mirroring,
  external CLI invocation, no embedded AI, dual GUI / CLI mode,
  built-in DSL evaluator, split-pane UI, forbidden matrix as
  reference view, expected-value column, `.tmodel` extension,
  clean-room reimplementation from PICT-PAPP, slice suggestion
  algorithm, forbidden enumeration scoping.
- Full UR / SR set in `Doc/requirements/`.
- DSL grammar EBNF in [`Doc/DSL_Grammar_Specification.md`](Doc/DSL_Grammar_Specification.md).

### Deferred (v2)

- UR-007 — natural-language → AI → DSL drafting (n8n integration).
- PICT-PAPP features explicitly out of MVP scope: Alloy verification of
  indirect forbidden combinations, level-value substitution test data
  generation, auto-derived DSL from a hand-edited forbidden matrix.

[0.1.0]: https://github.com/sho1884/NeoCombi/releases/tag/v0.1.0
