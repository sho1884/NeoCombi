# NeoCombi

> **Status:** Bootstrap — requirements drafting in progress. No production code yet.

**NeoCombi** is a comprehensive combinatorial test design tool that integrates pairwise testing with factor / level / constraint authoring. It uses Microsoft **PICT** (Pairwise Independent Combinatorial Testing) as its internal engine, and treats the PICT constraint language (`IF-THEN-ELSE`, `=`, `<>`, `>`, `>=`, `<`, `<=`, `AND`, `OR`, `NOT`, `LIKE`, `IN`) as a first-class DSL.

NeoCombi is a modern reconstruction (React + TypeScript) of the author's older Excel VBA tool **PICT-PAPP**, scaled up to handle HAYST-method workloads of 100–300 factors.

## Sibling Projects

NeoCombi is one of three sibling projects sharing the same problem domain (factor / level / constraint) but with different exits:

- **[NeoCEG](https://github.com/sho1884/NeoCEG)** — Cause-Effect Graph authoring tool.
- **[ModelLogue](https://github.com/sho1884/ModelLogue)** — AI-assisted review platform that consumes NeoCEG / NeoCombi outputs as model-type plug-ins.

NeoCEG and NeoCombi are **deterministic transformers** (no AI inside). ModelLogue provides AI review on top.

See [`Doc/PROJECT_KICKOFF.md`](Doc/PROJECT_KICKOFF.md) for the full architectural rationale.

## Goals

- Author factor / level tables and PICT-style constraints in a unified DSL.
- Generate pairwise / N-wise test cases via Microsoft PICT (invoked as an external CLI).
- Visualize results as cross-tabulated tables.
- Operate in both **GUI** (interactive authoring) and **CLI** (CI/CD pipeline) modes.
- Stay deterministic — same input always produces the same output.

## Non-Goals

- **No AI inside.** AI review is delegated to ModelLogue via a plug-in mechanism.
- **No PICT replacement.** NeoCombi is a pre/post processor for PICT, not a re-implementation of its algorithm.
- **No classification tree notation.** Deferred indefinitely; the factor / level table view is sufficient.

## Tech Stack (planned)

React 19 · TypeScript (strict) · Vite · Zustand · Vitest · Tailwind CSS · i18next.

Mirrors the NeoCEG stack to keep operational consistency across the sibling tools.

## External Dependency

NeoCombi delegates pairwise generation to **PICT** (Microsoft, MIT License) as an external CLI. PICT is **not bundled** — users provide it themselves:

- Linux: `apt install pict` or build from source
- macOS: `brew install pict`
- Windows: download from https://github.com/microsoft/pict

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — project guidelines for AI-assisted development
- [`Doc/PROJECT_KICKOFF.md`](Doc/PROJECT_KICKOFF.md) — bootstrap-time architectural decisions
- `Doc/requirements/` — user / system requirements (drafting in progress)
- `Doc/adr/` — Architecture Decision Records (YAML)

## License

MIT — see [LICENSE](LICENSE).
