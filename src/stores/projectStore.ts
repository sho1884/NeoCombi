import { create } from 'zustand'
import { parse } from '../engines/dsl'
import type {
  BottomPaneTab,
  ExpectedValueEntry,
  ForbiddenSliceConfig,
  ProjectState,
  ViewState,
} from '../types/project'
import { deserialize, serialize } from '../services/tmodelFile'

const DEFAULT_PICT_ORDER = 2

const DEFAULT_VIEW: ViewState = {
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
  setBottomPaneTab(tab: BottomPaneTab): void
  setFactorVisibility(factor: string, visible: boolean): void
  addForbiddenSlice(factors: string[]): void
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

  addForbiddenSlice(factors) {
    set(state => {
      const slice: ForbiddenSliceConfig = { factors: [...factors] }
      const nextSlices = [...state.view.forbiddenSlices, slice]
      return {
        view: {
          ...state.view,
          forbiddenSlices: nextSlices,
          activeSliceIndex: nextSlices.length - 1,
        },
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
