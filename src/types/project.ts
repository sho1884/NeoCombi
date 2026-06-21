// In-memory project state types. Persisted as a NeoCombi file (PICT DSL subset
// + a few `# @neocombi:` annotations): .ncombi for a DSL-only model, .ncproj for
// a full project (adds the persisted test set). See src/services/projectFile.ts
// for the file ↔ memory translation.

import type { ParseResult } from './dsl'
import type { TestSuite } from './testCase'

/**
 * One expected value attached to a specific factor / level combination.
 * MVP keys by display name (factor name + level value as text). On rename
 * of a factor or level in the DSL, matching expected values orphan and
 * are dropped on the next save (acceptable for MVP, see ADR-008 risks).
 */
export type ExpectedValueEntry = {
  /** Map from factor display name to level value (string representation). */
  assignment: Record<string, string>
  /** Free-text expected output. May contain spaces but no newlines (single-line). */
  value: string
}

/**
 * Test-case generation mode (UR-009 / SR-100). `pairwise` routes to PICT
 * (N-wise). `decision-table` routes to the built-in core (full combination,
 * forbidden rows marked).
 */
export type GenerationMode = 'pairwise' | 'decision-table'

export type BottomPaneTab = 'factors' | 'dsl' | 'testcases'

export type TopPaneTab = 'coverage' | 'forbidden'

/**
 * Configuration for one forbidden-matrix slice.
 *
 * Layout convention (SR-031): condition factors form the row axis (their
 * Cartesian product), the constrained factor forms the column axis. The
 * evaluator does not care about this distinction — it just enumerates the
 * Cartesian product of [...conditionFactors, constrainedFactor] — but the
 * UI renders the matrix asymmetrically based on the role each factor plays.
 */
export type ForbiddenSliceConfig = {
  conditionFactors: string[]
  constrainedFactor: string | null
}

/**
 * Session-only view state. Not persisted in the project file (resets to
 * defaults each time a project is opened).
 */
export type ViewState = {
  topPaneTab: TopPaneTab
  bottomPaneTab: BottomPaneTab
  /** Map factor name -> visible in the top-pane matrix (default true). */
  factorVisibility: Record<string, boolean>
  forbiddenSlices: ForbiddenSliceConfig[]
  /** Index into forbiddenSlices, or -1 when none is active. */
  activeSliceIndex: number
}

export type ProjectState = {
  /** Project file path on disk, or null for an unsaved project. */
  filePath: string | null
  /**
   * Raw DSL source. Stored without `# @neocombi:` annotation lines — those
   * are kept as structured fields below and re-emitted on save.
   */
  source: string
  /** Cached parse output; recomputed whenever source changes. */
  parseResult: ParseResult
  expectedValues: ExpectedValueEntry[]
  /**
   * The ACTIVE generation mode's test set (the one shown / edited). Persisted
   * in a project file (.ncproj) with its IDs, count flags, and notes (UR-011),
   * so it restores without regenerating; a model file (.ncombi) omits it. null
   * until generated.
   */
  testSuite: TestSuite | null
  /**
   * The OTHER mode's test set, kept so switching between pairwise and
   * decision-table does not discard either. There are exactly two modes, so a
   * single stash slot suffices: setGenerationMode swaps testSuite <-> this.
   * Persisted alongside the active set in a .ncproj.
   */
  inactiveSuite: TestSuite | null
  /** PICT generation order (N-wise); default 2 (pairwise). Persisted. */
  pictOrder: number
  /** Generation mode (pairwise via PICT vs decision-table via built-in core). Persisted. */
  generationMode: GenerationMode
  /** Session-only. */
  view: ViewState
  /** Has the project changed since last save / load? */
  isDirty: boolean
}
