# NeoCombi

[![release](https://img.shields.io/github/v/release/sho1884/NeoCombi?label=release&color=blue)](https://github.com/sho1884/NeoCombi/releases)
[![CI](https://github.com/sho1884/NeoCombi/actions/workflows/ci.yml/badge.svg)](https://github.com/sho1884/NeoCombi/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/sho1884/NeoCombi?color=blue)](LICENSE)

> **Try the demo:** https://neo-combi.vercel.app/ — DSL authoring, forbidden matrix, file save / open. Test-case generation needs a local PICT service (see [Quick start](#quick-start)).

> **Status: v0.1 (MVP)** — DSL authoring, factor / level editing, forbidden visualization, in-GUI test case generation via a local PICT service, expected-value tracking, and a CLI for CI/CD pipelines. Tested on models up to 100 factors / ~4 levels each.

**NeoCombi** is a combinatorial test design tool that pairs PICT-style DSL authoring with rich visualization. It mirrors Microsoft **PICT**'s constraint language (`IF/THEN/ELSE`, `=`, `<>`, `>`, `>=`, `<`, `<=`, `AND`, `OR`, `NOT`, `IN`) as a first-class subset DSL, parses it locally for instant feedback, and delegates pairwise / N-wise generation to PICT itself when invoked.

NeoCombi is a modern reconstruction of the author's older Excel VBA tool **PICT-PAPP**, scaled to handle HAYST-method workloads of 100–300 factors. The .tmodel file format is plain PICT input plus a few `# @neocombi:` annotations, so each project file is also a valid PICT model file.

## Sibling Projects

NeoCombi is one of three sibling tools that share the factor / level / constraint problem domain:

- **[NeoCEG](https://github.com/sho1884/NeoCEG)** — Cause-Effect Graph authoring tool.
- **[ModelLogue](https://github.com/sho1884/ModelLogue)** — AI-assisted review platform that consumes NeoCEG / NeoCombi outputs as model-type plug-ins.

NeoCEG and NeoCombi are **deterministic transformers** (no AI inside). ModelLogue provides AI review on top via n8n.

See [`Doc/PROJECT_KICKOFF.md`](Doc/PROJECT_KICKOFF.md) for the full architectural rationale.

## What's in v0.1

| User Requirement | Coverage |
|---|---|
| UR-001 Generate pairwise test cases | ✅ in the GUI via the local PICT service, and on the CLI |
| UR-002 Author factors, levels, constraints | ✅ DSL editor + Factors & Levels inline editing (rename / drag-reorder) |
| UR-003 Verify forbidden combinations | ✅ live forbidden matrix with constraint-propagation slice suggestions |
| UR-004 Verify pair coverage | ✅ cross-tabulation matrix with covered / missed / forbidden cells + summary |
| UR-005 Record expected values | ✅ editable Expected column on each test case, persisted in `.tmodel` |
| UR-006 Invoke from CI/CD pipeline | ✅ `neocombi generate` CLI with deterministic exit codes |
| UR-007 Natural-language → AI → DSL | ⛔ planned for v2 |

PICT-PAPP features deliberately deferred to v2: Alloy verification of indirect forbidden, level-value substitution test data generation, and the auto-generated DSL from a hand-edited forbidden matrix. See [`Doc/requirements/Requirements_Specification.md`](Doc/requirements/Requirements_Specification.md) for the full MVP scope.

## Quick start

### Install

NeoCombi requires Node.js 20+ and (for actual test case generation) Microsoft PICT on `PATH`.

```bash
# install PICT
sudo apt install pict       # Linux (Debian / Ubuntu)
brew install pict           # macOS
# Windows: download a build from https://github.com/microsoft/pict

# clone and install JS dependencies
git clone https://github.com/sho1884/NeoCombi.git
cd NeoCombi
npm install
```

### Author in the GUI

Two terminals — one for the dev server, one for the local PICT service that the GUI calls to generate test cases:

```bash
npm run dev                                    # vite dev server (http://localhost:5173)
docker compose up --build pict-service         # in another shell — local PICT API (http://localhost:5174)
```

Open `http://localhost:5173`. The header has **New / Open / Save / Save As** buttons backed by the File System Access API on Chrome / Edge (download fallback on Firefox / Safari).

A typical session:

1. **DSL** tab — write parameters and constraints (subset of PICT BNF; see [`Doc/DSL_Grammar_Specification.md`](Doc/DSL_Grammar_Specification.md)).
2. **Factors & Levels** tab — same data shown as a table; rename factors, add or remove levels inline, drag rows or level chips to reorder. Renames automatically rewrite `[refs]` in constraints.
3. **Top pane → Coverage** — exhaustive cross-tabulation with covered / missed / forbidden cells. The **Show** column in the Factors & Levels tab controls which factors appear here (per-row checkboxes plus All / None bulk toggles in the column header).
4. **Top pane → Forbidden** — live forbidden-combination matrix computed from the DSL by the in-house evaluator (no PICT spawn needed). The ✨ **Suggest from constraints** button proposes slices automatically, including propagation slices that surface chained restrictions across multiple constraints.
5. **Test cases** tab — automatic re-generation runs whenever the DSL parses cleanly, or click **Re-generate** for an explicit run. Edit the **Expected** column to record per-row expectations; values survive re-generation by stable id.
6. **Save As…** writes a `.tmodel` file you can re-open later or drop into CI.

### Install as a PWA

The dev server (and any production deployment) ships a Web App Manifest. Chrome / Edge will offer an "Install NeoCombi" affordance in the address-bar menu; once installed, NeoCombi runs as a standalone window with the K₅ icon.

### Generate test cases on the CLI

```bash
node bin/neocombi.mjs generate path/to/project.tmodel
```

The CLI reads the `.tmodel` file, validates the DSL, runs PICT, and prints CSV to stdout. Common flags:

```bash
neocombi generate model.tmodel --format json --output cases.json
neocombi generate model.tmodel --order 3                # 3-wise instead of pairwise
neocombi generate model.tmodel --pict /opt/bin/pict     # explicit PICT path
NEOCOMBI_PICT_PATH=/opt/bin/pict neocombi generate model.tmodel
```

Exit codes for CI:

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | DSL parse / validation error |
| 2 | PICT invocation failed |
| 3 | input file not found / unreadable |
| 4 | output write failed |

### Import CLI output back into the GUI

In the **Test cases** tab, click **Import CSV…** and pick the file the CLI produced. The grid populates and the upper-pane coverage matrix overlays occurrence counts.

## .tmodel file format

The on-disk format is plain PICT DSL plus two NeoCombi-specific annotations carried in PICT-compatible comments:

```
OS:      Linux, Windows, macOS
Browser: Chrome, Firefox, Safari

IF [OS] = "Linux" THEN [Browser] <> "Safari";

# ===== NeoCombi annotations (auto-generated; do not edit) =====
# @neocombi:order 3
# @neocombi:expected OS=Linux Browser=Chrome | Renders OK
```

Because annotation lines are PICT comments, you can also feed a `.tmodel` file directly to PICT:

```bash
pict project.tmodel /o:2
```

## Tech stack

React 19 · TypeScript 5.9 (strict) · Vite 7 · Zustand 5 · Vitest 3 · ESLint 9 · vite-plugin-pwa 1.

The stack mirrors NeoCEG to keep operational consistency across sibling tools. Tailwind CSS is mentioned in CLAUDE.md but is not yet introduced — current styling is plain CSS scoped per component.

## External dependency

NeoCombi delegates pairwise / N-wise generation to **PICT** (Microsoft, MIT License). PICT is **not bundled** — users install it themselves; NeoCombi spawns it as a child process from the CLI:

- Linux: `apt install pict`, or build from source
- macOS: `brew install pict`
- Windows: download from https://github.com/microsoft/pict

The DSL evaluator that powers the live forbidden matrix is implemented locally in NeoCombi and does **not** require PICT to be installed.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — project guidelines (security, license policy, AI-assisted development)
- [`Doc/PROJECT_KICKOFF.md`](Doc/PROJECT_KICKOFF.md) — architectural rationale and 3-sibling context
- [`Doc/requirements/Requirements_Specification.md`](Doc/requirements/Requirements_Specification.md) — UR / SR specification
- [`Doc/DSL_Grammar_Specification.md`](Doc/DSL_Grammar_Specification.md) — PICT-subset EBNF
- [`Doc/ADR_Index.md`](Doc/ADR_Index.md) — recorded architecture decisions
- [`examples/`](examples/) — sample `.tmodel` files

## License

MIT — see [LICENSE](LICENSE).
