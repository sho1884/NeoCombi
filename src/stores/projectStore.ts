import { create } from 'zustand'
import { parse } from '../engines/dsl'
import type {
  BottomPaneTab,
  ExpectedValueEntry,
  ForbiddenSliceConfig,
  ProjectState,
  TopPaneTab,
  ViewState,
} from '../types/project'
import type { TestSuite } from '../types/testCase'
import { deserialize, serialize } from '../services/tmodelFile'
import {
  addFactor as editAddFactor,
  addLevelToFactor as editAddLevel,
  removeFactor as editRemoveFactor,
  removeLevelFromFactor as editRemoveLevel,
  renameFactor as editRenameFactor,
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

function allKeysMatch(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  // Same as assignmentEquals but tolerates extra keys in `b`. Used when
  // matching a stored expected entry's assignment against a full test case
  // (the test case row has all factor values; the entry has the subset
  // the user keyed against).
  for (const [k, v] of Object.entries(a)) {
    if (b[k] !== v) return false
  }
  return Object.keys(a).length === Object.keys(b).length
    ? true
    : Object.keys(a).every(k => b[k] === a[k])
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
  setPictOrder(order: number): void
  /** Add or update an expected value matched by exact assignment. */
  setExpectedValue(assignment: Record<string, string>, value: string): void
  /** Remove the expected value matching the given assignment, if any. */
  clearExpectedValue(assignment: Record<string, string>): void
  setTopPaneTab(tab: TopPaneTab): void
  setBottomPaneTab(tab: BottomPaneTab): void
  setFactorVisibility(factor: string, visible: boolean): void
  /** Append a new forbidden-slice configuration and select it as active. */
  addForbiddenSlice(slice?: ForbiddenSliceConfig): void
  /** Replace the active slice's configuration. No-op when no slice is active. */
  updateActiveSlice(slice: ForbiddenSliceConfig): void
  /** Remove a slice by index. Adjusts activeSliceIndex if needed. */
  removeForbiddenSlice(index: number): void
  setActiveSliceIndex(index: number): void
  /** Replace project state from a .tmodel file's contents. Resets dirty flag. */
  loadFromTmodel(content: string, filePath?: string | null): void
  /** Serialize the persistable subset of state to .tmodel format. */
  toTmodel(): string
  /** Replace the current test suite (e.g., from CSV import). null clears it. */
  setTestSuite(suite: TestSuite | null): void
  /** Update the expected value of a single test case by row index. */
  setTestCaseExpected(index: number, value: string): void
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

  setPictOrder(order) {
    if (order === get().pictOrder) return
    set({ pictOrder: order, isDirty: true })
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

  loadFromTmodel(content, filePath) {
    const result = deserialize(content)
    set({
      filePath: filePath ?? null,
      source: result.source,
      parseResult: parse(result.source),
      expectedValues: result.expectedValues,
      testSuite: null,
      pictOrder: result.pictOrder,
      view: { ...DEFAULT_VIEW },
      isDirty: false,
    })
  },

  toTmodel() {
    const state = get()
    return serialize({
      source: state.source,
      expectedValues: state.expectedValues,
      pictOrder: state.pictOrder,
    })
  },

  setTestSuite(suite) {
    // Drop / replace the test suite in place. Importing CSV should also
    // surface any expected values the user already maintained: walk the
    // imported rows and attach matching expected entries.
    set(state => {
      if (suite === null) return { testSuite: null }
      const enriched: TestSuite = {
        factorOrder: suite.factorOrder.slice(),
        rows: suite.rows.map(row => {
          if (row.expected !== undefined) return row
          for (const ev of state.expectedValues) {
            let matches = true
            for (const [k, v] of Object.entries(ev.assignment)) {
              if (row.values[k] !== v) {
                matches = false
                break
              }
            }
            if (matches) return { ...row, expected: ev.value }
          }
          return row
        }),
      }
      return { testSuite: enriched }
    })
  },

  setTestCaseExpected(index, value) {
    set(state => {
      if (!state.testSuite) return state
      if (index < 0 || index >= state.testSuite.rows.length) return state
      const rows = state.testSuite.rows.slice()
      const target = rows[index]!
      const trimmed = value
      const updated = trimmed.length > 0
        ? { ...target, expected: trimmed }
        : (() => {
            const { expected: _ignored, ...rest } = target
            void _ignored
            return rest
          })()
      rows[index] = updated
      // Mirror the user's edit into expectedValues so the next save
      // captures it (UR-005 / SR-052).
      const assignment = state.testSuite.factorOrder.reduce<Record<string, string>>(
        (acc, name) => {
          acc[name] = target.values[name] ?? ''
          return acc
        },
        {},
      )
      const evCopy = state.expectedValues.slice()
      const existingIdx = evCopy.findIndex(ev => allKeysMatch(ev.assignment, assignment))
      if (trimmed.length > 0) {
        const entry: ExpectedValueEntry = { assignment, value: trimmed }
        if (existingIdx >= 0) evCopy[existingIdx] = entry
        else evCopy.push(entry)
      } else if (existingIdx >= 0) {
        evCopy.splice(existingIdx, 1)
      }
      return {
        testSuite: { ...state.testSuite, rows },
        expectedValues: evCopy,
        isDirty: true,
      }
    })
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
