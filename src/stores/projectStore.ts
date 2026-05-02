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
import { deserialize, serialize } from '../services/tmodelFile'

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

type Actions = {
  /** Replace the DSL source. Recomputes parse and marks the project dirty. */
  setSource(source: string): void
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
