import { create } from 'zustand'
import { parse } from '../engines/dsl'
import type {
  BottomPaneTab,
  ExpectedValueEntry,
  ForbiddenSliceConfig,
  GenerationMode,
  ProjectState,
  TopPaneTab,
  ViewState,
} from '../types/project'
import type { TestSuite } from '../types/testCase'
import { deserialize, serialize } from '../services/projectFile'
import { assignCaseIds, suiteHasAnnotations } from '../services/caseIds'
import {
  addFactor as editAddFactor,
  addLevelToFactor as editAddLevel,
  moveFactor as editMoveFactor,
  moveFactorTo as editMoveFactorTo,
  moveLevel as editMoveLevel,
  moveLevelTo as editMoveLevelTo,
  removeFactor as editRemoveFactor,
  removeLevelFromFactor as editRemoveLevel,
  renameFactor as editRenameFactor,
  renameLevel as editRenameLevel,
} from '../services/dslEditing'

const DEFAULT_PICT_ORDER = 2

const DEFAULT_VIEW: ViewState = {
  topPaneTab: 'coverage',
  bottomPaneTab: 'factors',
  factorVisibility: {},
  forbiddenSlices: [],
  activeSliceIndex: -1,
}

function emptyState(): ProjectState {
  const source = ''
  return {
    filePath: null,
    source,
    parseResult: parse(source),
    expectedValues: [],
    testSuite: null,
    pictOrder: DEFAULT_PICT_ORDER,
    generationMode: 'pairwise',
    view: { ...DEFAULT_VIEW },
    isDirty: false,
  }
}

function assignmentEquals(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function assignmentSubsetMatches(
  needle: Record<string, string>,
  haystack: Record<string, string>,
): boolean {
  // Returns true when every key/value in `needle` is also present in
  // `haystack` with the same value. Extra keys in `haystack` are ignored.
  // Used to match a possibly-partial stored expected-value entry against
  // a full test-case row.
  for (const [k, v] of Object.entries(needle)) {
    if (haystack[k] !== v) return false
  }
  return true
}

type Actions = {
  /** Replace the DSL source. Recomputes parse and marks the project dirty. */
  setSource(source: string): void
  /** Rename a factor across the source (declaration + all [refs]). */
  renameFactor(oldName: string, newName: string): void
  /** Append a new factor with default placeholder levels. */
  addFactor(name: string, levels?: string[]): void
  /** Remove a factor's declaration line; dependent constraints are left in place. */
  removeFactor(name: string): void
  /** Append a level to a factor's level list. */
  addLevelToFactor(factorName: string, levelValue: string): void
  /** Remove a level from a factor's level list (refuses to empty the list). */
  removeLevelFromFactor(factorName: string, levelValue: string): void
  /** Rename a level across declaration and all matching constraint references. */
  renameLevel(factorName: string, oldValue: string, newValue: string): void
  /** Move a factor up / down in declaration order. */
  moveFactor(factorName: string, direction: 'up' | 'down'): void
  /** Move a factor to an absolute index (used by drag-and-drop). */
  moveFactorTo(factorName: string, targetIndex: number): void
  /** Move a level up / down within its factor's level list. */
  moveLevel(factorName: string, levelValue: string, direction: 'up' | 'down'): void
  /** Move a level to an absolute index (used by drag-and-drop). */
  moveLevelTo(factorName: string, levelValue: string, targetIndex: number): void
  setPictOrder(order: number): void
  /** Switch the generation mode (pairwise / decision-table). */
  setGenerationMode(mode: GenerationMode): void
  /** Add or update an expected value matched by exact assignment. */
  setExpectedValue(assignment: Record<string, string>, value: string): void
  /** Remove the expected value matching the given assignment, if any. */
  clearExpectedValue(assignment: Record<string, string>): void
  setTopPaneTab(tab: TopPaneTab): void
  setBottomPaneTab(tab: BottomPaneTab): void
  setFactorVisibility(factor: string, visible: boolean): void
  /** Bulk-set visibility for every declared factor. */
  setAllFactorsVisible(visible: boolean): void
  /** Append a new forbidden-slice configuration and select it as active. */
  addForbiddenSlice(slice?: ForbiddenSliceConfig): void
  /** Replace the active slice's configuration. No-op when no slice is active. */
  updateActiveSlice(slice: ForbiddenSliceConfig): void
  /** Remove a slice by index. Adjusts activeSliceIndex if needed. */
  removeForbiddenSlice(index: number): void
  setActiveSliceIndex(index: number): void
  /** Replace project state from a .ncombi / .ncproj / legacy .tmodel file. Resets dirty. */
  loadProjectFile(content: string, filePath?: string | null): void
  /** Serialize as a full project (.ncproj): DSL + settings + persisted test set. */
  toProjectFile(): string
  /** Serialize as a DSL-only model (.ncombi): no persisted test set. */
  toModelFile(): string
  /**
   * Replace the current test suite from a fresh generation / import. Enriches
   * notes from expectedValues and (re)assigns stable IDs + default count flags
   * for the current generation mode. null clears it. Restoring a persisted set
   * on load goes through loadFromTmodel instead (no reassignment).
   */
  setTestSuite(suite: TestSuite | null): void
  /** Set the free-form note (UR-005) of a single test case by row index. */
  setTestCaseNote(index: number, note: string): void
  /** Set the count-toward-coverage flag (UR-010) of a test case by row index. */
  setTestCaseCount(index: number, count: boolean): void
  /** True when any case carries a count flag (off) or note (SR-073 guard). */
  hasFlagsOrNotes(): boolean
  /** Mark the project as saved (clears dirty flag and updates filePath). */
  markSaved(filePath?: string | null): void
  resetToEmpty(): void
}

type Store = ProjectState & Actions

export const useProjectStore = create<Store>()((set, get) => ({
  ...emptyState(),

  setSource(source) {
    const parseResult = parse(source)
    set({ source, parseResult, isDirty: true })
  },

  renameFactor(oldName, newName) {
    const next = editRenameFactor(get().source, oldName, newName)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  addFactor(name, levels) {
    const next = editAddFactor(get().source, name, levels)
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  removeFactor(name) {
    const next = editRemoveFactor(get().source, name)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  addLevelToFactor(factorName, levelValue) {
    const next = editAddLevel(get().source, factorName, levelValue)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  removeLevelFromFactor(factorName, levelValue) {
    const next = editRemoveLevel(get().source, factorName, levelValue)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  renameLevel(factorName, oldValue, newValue) {
    const next = editRenameLevel(get().source, factorName, oldValue, newValue)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  moveFactor(factorName, direction) {
    const next = editMoveFactor(get().source, factorName, direction)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  moveFactorTo(factorName, targetIndex) {
    const next = editMoveFactorTo(get().source, factorName, targetIndex)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  moveLevel(factorName, levelValue, direction) {
    const next = editMoveLevel(get().source, factorName, levelValue, direction)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  moveLevelTo(factorName, levelValue, targetIndex) {
    const next = editMoveLevelTo(get().source, factorName, levelValue, targetIndex)
    if (next === get().source) return
    set({ source: next, parseResult: parse(next), isDirty: true })
  },

  setPictOrder(order) {
    if (order === get().pictOrder) return
    set({ pictOrder: order, isDirty: true })
  },

  setGenerationMode(mode) {
    if (mode === get().generationMode) return
    // Clear the suite: the displayed rows belong to the previous mode (pairwise
    // rows have no forbidden flag; decision-table rows do). Re-generate.
    set({ generationMode: mode, testSuite: null, isDirty: true })
  },

  setExpectedValue(assignment, value) {
    set(state => {
      const nextEntries = state.expectedValues.slice()
      const existing = nextEntries.findIndex(ev => assignmentEquals(ev.assignment, assignment))
      const entry: ExpectedValueEntry = { assignment: { ...assignment }, value }
      if (existing >= 0) {
        nextEntries[existing] = entry
      } else {
        nextEntries.push(entry)
      }
      return { expectedValues: nextEntries, isDirty: true }
    })
  },

  clearExpectedValue(assignment) {
    set(state => {
      const filtered = state.expectedValues.filter(
        ev => !assignmentEquals(ev.assignment, assignment),
      )
      if (filtered.length === state.expectedValues.length) return state
      return { expectedValues: filtered, isDirty: true }
    })
  },

  setTopPaneTab(tab) {
    set(state => ({ view: { ...state.view, topPaneTab: tab } }))
  },

  setBottomPaneTab(tab) {
    set(state => ({ view: { ...state.view, bottomPaneTab: tab } }))
  },

  setAllFactorsVisible(visible) {
    set(state => {
      const factors = state.parseResult.model?.parameters ?? []
      const next: Record<string, boolean> = {}
      for (const p of factors) next[p.name] = visible
      return {
        view: { ...state.view, factorVisibility: next },
      }
    })
  },

  setFactorVisibility(factor, visible) {
    set(state => ({
      view: {
        ...state.view,
        factorVisibility: { ...state.view.factorVisibility, [factor]: visible },
      },
    }))
  },

  addForbiddenSlice(slice) {
    set(state => {
      const newSlice: ForbiddenSliceConfig =
        slice ?? { conditionFactors: [], constrainedFactor: null }
      const nextSlices = [...state.view.forbiddenSlices, newSlice]
      return {
        view: {
          ...state.view,
          forbiddenSlices: nextSlices,
          activeSliceIndex: nextSlices.length - 1,
        },
      }
    })
  },

  updateActiveSlice(slice) {
    set(state => {
      const idx = state.view.activeSliceIndex
      if (idx < 0 || idx >= state.view.forbiddenSlices.length) return state
      const next = state.view.forbiddenSlices.slice()
      next[idx] = slice
      return { view: { ...state.view, forbiddenSlices: next } }
    })
  },

  removeForbiddenSlice(index) {
    set(state => {
      if (index < 0 || index >= state.view.forbiddenSlices.length) return state
      const next = state.view.forbiddenSlices.slice()
      next.splice(index, 1)
      let active = state.view.activeSliceIndex
      if (next.length === 0) {
        active = -1
      } else if (active === index) {
        active = Math.max(0, index - 1)
      } else if (active > index) {
        active = active - 1
      }
      return {
        view: { ...state.view, forbiddenSlices: next, activeSliceIndex: active },
      }
    })
  },

  setActiveSliceIndex(index) {
    set(state => ({ view: { ...state.view, activeSliceIndex: index } }))
  },

  loadProjectFile(content, filePath) {
    const result = deserialize(content)
    set({
      filePath: filePath ?? null,
      source: result.source,
      parseResult: parse(result.source),
      expectedValues: result.expectedValues,
      // UR-011 / SR-072: restore the persisted test set verbatim. No
      // regeneration runs on load — the saved rows (with their IDs, flags,
      // notes) are authoritative.
      testSuite: result.testSuite,
      pictOrder: result.pictOrder,
      generationMode: result.generationMode,
      view: { ...DEFAULT_VIEW },
      isDirty: false,
    })
  },

  toProjectFile() {
    const state = get()
    return serialize({
      source: state.source,
      expectedValues: state.expectedValues,
      pictOrder: state.pictOrder,
      generationMode: state.generationMode,
      testSuite: state.testSuite,
    })
  },

  toModelFile() {
    const state = get()
    // A model file (.ncombi) is DSL + settings + rules only — the persisted
    // test set is deliberately omitted (testSuite: null).
    return serialize({
      source: state.source,
      expectedValues: state.expectedValues,
      pictOrder: state.pictOrder,
      generationMode: state.generationMode,
      testSuite: null,
    })
  },

  setTestSuite(suite) {
    // Replace the test suite from a fresh generation / import. Enrich notes
    // from any expectedValues rules the user maintained (more-specific entries
    // override less-specific ones), then assign stable IDs and default count
    // flags for the current generation mode (UR-010).
    set(state => {
      if (suite === null) return { testSuite: null, isDirty: true }
      const sortedEntries = [...state.expectedValues].sort(
        (a, b) =>
          Object.keys(b.assignment).length - Object.keys(a.assignment).length,
      )
      const enriched: TestSuite = {
        factorOrder: suite.factorOrder.slice(),
        rows: suite.rows.map(row => {
          if (row.note !== undefined && row.note.length > 0) return row
          for (const ev of sortedEntries) {
            if (assignmentSubsetMatches(ev.assignment, row.values)) {
              return { ...row, note: ev.value }
            }
          }
          return row
        }),
      }
      // The ID prefix follows the data, not the mode setting: decision-table
      // rows always carry a forbidden flag (true/false), pairwise rows never do.
      const mode = suite.rows.some(r => r.forbidden !== undefined)
        ? 'decision-table'
        : 'pairwise'
      return { testSuite: assignCaseIds(enriched, mode), isDirty: true }
    })
  },

  setTestCaseNote(index, note) {
    set(state => {
      if (!state.testSuite) return state
      if (index < 0 || index >= state.testSuite.rows.length) return state
      const rows = state.testSuite.rows.slice()
      const target = rows[index]!
      // Note lives on the persisted row (UR-011); it is bound to the case by
      // ID, not mirrored into the assignment-based expectedValues rule layer.
      const next = { ...target }
      if (note.length > 0) next.note = note
      else delete next.note
      rows[index] = next
      return { testSuite: { ...state.testSuite, rows }, isDirty: true }
    })
  },

  setTestCaseCount(index, count) {
    set(state => {
      if (!state.testSuite) return state
      if (index < 0 || index >= state.testSuite.rows.length) return state
      const target = state.testSuite.rows[index]!
      // Forbidden rows are not test cases and carry no flag.
      if (target.forbidden === true) return state
      const rows = state.testSuite.rows.slice()
      rows[index] = { ...target, count }
      return { testSuite: { ...state.testSuite, rows }, isDirty: true }
    })
  },

  hasFlagsOrNotes() {
    return suiteHasAnnotations(get().testSuite)
  },

  markSaved(filePath) {
    set(state => ({
      isDirty: false,
      filePath: filePath !== undefined ? filePath : state.filePath,
    }))
  },

  resetToEmpty() {
    set(emptyState())
  },
}))
