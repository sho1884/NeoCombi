import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../src/stores/projectStore'

beforeEach(() => {
  useProjectStore.getState().resetToEmpty()
})

describe('projectStore / source and parsing', () => {
  it('starts empty with a successful parse of an empty source', () => {
    const s = useProjectStore.getState()
    expect(s.source).toBe('')
    expect(s.parseResult.diagnostics).toEqual([])
    expect(s.parseResult.model?.parameters).toEqual([])
    expect(s.isDirty).toBe(false)
  })

  it('reparses on setSource and marks the project dirty', () => {
    useProjectStore.getState().setSource('OS: Linux, Windows')
    const s = useProjectStore.getState()
    expect(s.source).toBe('OS: Linux, Windows')
    expect(s.parseResult.model?.parameters).toHaveLength(1)
    expect(s.isDirty).toBe(true)
  })
})

describe('projectStore / pictOrder', () => {
  it('sets order and marks dirty', () => {
    useProjectStore.getState().setPictOrder(3)
    expect(useProjectStore.getState().pictOrder).toBe(3)
    expect(useProjectStore.getState().isDirty).toBe(true)
  })

  it('does not flip dirty when setting the same order', () => {
    expect(useProjectStore.getState().isDirty).toBe(false)
    useProjectStore.getState().setPictOrder(2)  // 2 is the default
    expect(useProjectStore.getState().isDirty).toBe(false)
  })
})

describe('projectStore / expected values', () => {
  it('adds a new expected value', () => {
    useProjectStore
      .getState()
      .setExpectedValue({ OS: 'Linux', Browser: 'Chrome' }, 'OK')
    const s = useProjectStore.getState()
    expect(s.expectedValues).toEqual([
      { assignment: { OS: 'Linux', Browser: 'Chrome' }, value: 'OK' },
    ])
  })

  it('updates an existing entry that matches by exact assignment', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux', Browser: 'Chrome' }, 'first')
    store.setExpectedValue({ OS: 'Linux', Browser: 'Chrome' }, 'second')
    const s = useProjectStore.getState()
    expect(s.expectedValues).toHaveLength(1)
    expect(s.expectedValues[0]?.value).toBe('second')
  })

  it('treats different assignments as separate entries', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux' }, 'a')
    store.setExpectedValue({ OS: 'Windows' }, 'b')
    expect(useProjectStore.getState().expectedValues).toHaveLength(2)
  })

  it('clears an entry by exact match', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux' }, 'a')
    store.clearExpectedValue({ OS: 'Linux' })
    expect(useProjectStore.getState().expectedValues).toEqual([])
    expect(useProjectStore.getState().isDirty).toBe(true)
  })

  it('does not flip dirty when clearing a non-existent assignment', () => {
    expect(useProjectStore.getState().isDirty).toBe(false)
    useProjectStore.getState().clearExpectedValue({ Bogus: 'X' })
    expect(useProjectStore.getState().isDirty).toBe(false)
  })
})

describe('projectStore / view state', () => {
  it('switches the bottom-pane tab without marking dirty (session-only)', () => {
    useProjectStore.getState().setBottomPaneTab('dsl')
    const s = useProjectStore.getState()
    expect(s.view.bottomPaneTab).toBe('dsl')
    expect(s.isDirty).toBe(false)
  })

  it('toggles factor visibility by name', () => {
    useProjectStore.getState().setFactorVisibility('OS', false)
    expect(useProjectStore.getState().view.factorVisibility['OS']).toBe(false)
  })

  it('adds an empty forbidden slice and sets it as active', () => {
    useProjectStore.getState().addForbiddenSlice()
    const v = useProjectStore.getState().view
    expect(v.forbiddenSlices).toHaveLength(1)
    expect(v.forbiddenSlices[0]).toEqual({
      conditionFactors: [],
      constrainedFactor: null,
    })
    expect(v.activeSliceIndex).toBe(0)
  })

  it('adds a slice with provided configuration', () => {
    useProjectStore.getState().addForbiddenSlice({
      conditionFactors: ['OS'],
      constrainedFactor: 'Browser',
    })
    expect(useProjectStore.getState().view.forbiddenSlices[0]).toEqual({
      conditionFactors: ['OS'],
      constrainedFactor: 'Browser',
    })
  })

  it('updates the active slice in place', () => {
    const store = useProjectStore.getState()
    store.addForbiddenSlice()
    store.updateActiveSlice({
      conditionFactors: ['OS', 'Memory'],
      constrainedFactor: 'Browser',
    })
    expect(useProjectStore.getState().view.forbiddenSlices[0]).toEqual({
      conditionFactors: ['OS', 'Memory'],
      constrainedFactor: 'Browser',
    })
  })

  it('removes a slice and shifts active index', () => {
    const store = useProjectStore.getState()
    store.addForbiddenSlice({ conditionFactors: ['A'], constrainedFactor: 'B' })
    store.addForbiddenSlice({ conditionFactors: ['C'], constrainedFactor: 'D' })
    store.setActiveSliceIndex(1)
    store.removeForbiddenSlice(0)
    const v = useProjectStore.getState().view
    expect(v.forbiddenSlices).toHaveLength(1)
    expect(v.forbiddenSlices[0]?.conditionFactors).toEqual(['C'])
    expect(v.activeSliceIndex).toBe(0)
  })

  it('clears active index when the last slice is removed', () => {
    const store = useProjectStore.getState()
    store.addForbiddenSlice()
    store.removeForbiddenSlice(0)
    expect(useProjectStore.getState().view.activeSliceIndex).toBe(-1)
  })

  it('switches the top-pane tab between coverage and forbidden', () => {
    useProjectStore.getState().setTopPaneTab('forbidden')
    expect(useProjectStore.getState().view.topPaneTab).toBe('forbidden')
    useProjectStore.getState().setTopPaneTab('coverage')
    expect(useProjectStore.getState().view.topPaneTab).toBe('coverage')
  })
})

describe('projectStore / test suite: IDs, notes, count flags', () => {
  it('assigns stable P-IDs and default count flags on a fresh pairwise suite', () => {
    const store = useProjectStore.getState()
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [
        { values: { OS: 'Linux', Browser: 'Chrome' } },
        { values: { OS: 'Windows', Browser: 'Safari' } },
      ],
    })
    const suite = useProjectStore.getState().testSuite
    expect(suite?.rows.map(r => r.id)).toEqual(['P1', 'P2'])
    expect(suite?.rows.every(r => r.count === true)).toBe(true)
  })

  it('attaches a partial-key expected entry as the note on every matching row', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux' }, 'hello')
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [
        { values: { OS: 'Linux', Browser: 'Chrome' } },
        { values: { OS: 'Linux', Browser: 'Firefox' } },
        { values: { OS: 'Windows', Browser: 'Chrome' } },
      ],
    })
    const suite = useProjectStore.getState().testSuite
    expect(suite?.rows[0]?.note).toBe('hello')
    expect(suite?.rows[1]?.note).toBe('hello')
    expect(suite?.rows[2]?.note).toBeUndefined()
  })

  it('a more-specific expected entry wins over a partial one on auto-attach', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux' }, 'partial')
    store.setExpectedValue({ OS: 'Linux', Browser: 'Chrome' }, 'specific')
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [
        { values: { OS: 'Linux', Browser: 'Chrome' } },
        { values: { OS: 'Linux', Browser: 'Firefox' } },
      ],
    })
    const suite = useProjectStore.getState().testSuite
    expect(suite?.rows[0]?.note).toBe('specific')
    expect(suite?.rows[1]?.note).toBe('partial')
  })

  it('editing a row note writes only to that row, not the rule layer', () => {
    const store = useProjectStore.getState()
    store.setExpectedValue({ OS: 'Linux' }, 'hello')
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [
        { values: { OS: 'Linux', Browser: 'Chrome' } },
        { values: { OS: 'Linux', Browser: 'Firefox' } },
      ],
    })
    store.setTestCaseNote(0, 'override-for-chrome')
    const after = useProjectStore.getState()
    expect(after.testSuite?.rows[0]?.note).toBe('override-for-chrome')
    // The other row keeps the value seeded at generation; nothing else changed.
    expect(after.testSuite?.rows[1]?.note).toBe('hello')
    // The note edit is bound to the persisted row, not mirrored into the
    // assignment-based expectedValues rule layer (UR-011 / SR-052).
    expect(after.expectedValues).toEqual([{ assignment: { OS: 'Linux' }, value: 'hello' }])
    expect(after.isDirty).toBe(true)
  })

  it('clearing a row note removes it from that row', () => {
    const store = useProjectStore.getState()
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [{ values: { OS: 'Linux', Browser: 'Chrome' }, note: 'first' }],
    })
    store.setTestCaseNote(0, '')
    expect(useProjectStore.getState().testSuite?.rows[0]?.note).toBeUndefined()
  })

  it('carries a factor rename into the persisted set (SR-052), keeping id/flag/note', () => {
    const store = useProjectStore.getState()
    store.setSource('OS: Linux, Windows\nBrowser: Chrome, Safari\n')
    store.setTestSuite({
      factorOrder: ['OS', 'Browser'],
      rows: [{ values: { OS: 'Linux', Browser: 'Chrome' }, note: 'memo' }],
    })
    store.setTestCaseCount(0, false)
    store.renameFactor('OS', 'Platform')
    const suite = useProjectStore.getState().testSuite!
    expect(suite.factorOrder).toEqual(['Platform', 'Browser'])
    expect(suite.rows[0]?.values).toEqual({ Platform: 'Linux', Browser: 'Chrome' })
    // Identity-bearing fields survive the rename — no regeneration occurred.
    expect(suite.rows[0]?.id).toBe('P1')
    expect(suite.rows[0]?.count).toBe(false)
    expect(suite.rows[0]?.note).toBe('memo')
  })

  it('carries a level rename into the persisted set', () => {
    const store = useProjectStore.getState()
    store.setSource('OS: Linux, Windows\n')
    store.setTestSuite({
      factorOrder: ['OS'],
      rows: [{ values: { OS: 'Linux' } }, { values: { OS: 'Windows' } }],
    })
    store.renameLevel('OS', 'Linux', 'Ubuntu')
    const rows = useProjectStore.getState().testSuite!.rows
    expect(rows[0]?.values['OS']).toBe('Ubuntu')
    expect(rows[1]?.values['OS']).toBe('Windows')
  })

  it('toggles the count flag; forbidden rows have no flag to toggle', () => {
    const store = useProjectStore.getState()
    store.setGenerationMode('decision-table')
    store.setTestSuite({
      factorOrder: ['OS'],
      rows: [
        { values: { OS: 'Linux' }, forbidden: false },
        { values: { OS: 'Windows' }, forbidden: true },
      ],
    })
    store.setTestCaseCount(0, false)
    expect(useProjectStore.getState().testSuite?.rows[0]?.count).toBe(false)
    // Forbidden row is unaffected (it never had a flag).
    store.setTestCaseCount(1, false)
    expect(useProjectStore.getState().testSuite?.rows[1]?.count).toBeUndefined()
    expect(useProjectStore.getState().hasFlagsOrNotes()).toBe(true)
  })
})

describe('projectStore / load and save', () => {
  it('loads a .tmodel file and resets dirty', () => {
    const tmodel = [
      '# @neocombi:order 3',
      'OS: Linux, Windows',
      '# @neocombi:expected OS=Linux | runs OK',
      '',
    ].join('\n')
    useProjectStore.getState().loadProjectFile(tmodel, '/tmp/example.tmodel')
    const s = useProjectStore.getState()
    expect(s.filePath).toBe('/tmp/example.tmodel')
    expect(s.pictOrder).toBe(3)
    expect(s.source).toBe('OS: Linux, Windows\n')
    expect(s.expectedValues).toEqual([
      { assignment: { OS: 'Linux' }, value: 'runs OK' },
    ])
    expect(s.isDirty).toBe(false)
  })

  it('serializes back to a .tmodel string via toProjectFile', () => {
    const store = useProjectStore.getState()
    store.setSource('OS: Linux, Windows\n')
    store.setPictOrder(3)
    store.setExpectedValue({ OS: 'Linux' }, 'OK')
    const text = useProjectStore.getState().toProjectFile()
    expect(text).toContain('OS: Linux, Windows')
    expect(text).toContain('# @neocombi:order 3')
    expect(text).toContain('# @neocombi:expected OS=Linux | OK')
  })

  it('round-trips load -> save -> load to identical structured state', () => {
    const initial = [
      '# @neocombi:order 3',
      'OS: Linux, Windows',
      'Browser: Chrome, Safari',
      'IF [OS] = "Linux" THEN [Browser] <> "Safari";',
      '# @neocombi:expected OS=Linux Browser=Chrome | renders OK',
      '',
    ].join('\n')
    useProjectStore.getState().loadProjectFile(initial)
    const text = useProjectStore.getState().toProjectFile()
    useProjectStore.getState().resetToEmpty()
    useProjectStore.getState().loadProjectFile(text)
    const s = useProjectStore.getState()
    expect(s.pictOrder).toBe(3)
    expect(s.expectedValues).toEqual([
      { assignment: { OS: 'Linux', Browser: 'Chrome' }, value: 'renders OK' },
    ])
    expect(s.source).toContain('OS: Linux, Windows')
    expect(s.source).toContain('IF [OS] = "Linux"')
  })

  it('toModelFile omits the persisted test set; toProjectFile includes it', () => {
    const store = useProjectStore.getState()
    store.setSource('OS: Linux, Windows\n')
    store.setTestSuite({
      factorOrder: ['OS'],
      rows: [{ values: { OS: 'Linux' }, note: 'memo' }],
    })
    const model = useProjectStore.getState().toModelFile()
    const project = useProjectStore.getState().toProjectFile()
    expect(model).not.toContain('@neocombi:case')
    expect(model).toContain('OS: Linux, Windows')
    expect(project).toContain('@neocombi:case')
    // A model file round-trips with no test set; a project file restores it.
    useProjectStore.getState().loadProjectFile(model)
    expect(useProjectStore.getState().testSuite).toBeNull()
    useProjectStore.getState().loadProjectFile(project)
    expect(useProjectStore.getState().testSuite?.rows[0]?.note).toBe('memo')
  })

  it('saves and restores BOTH the pairwise and decision-table sets', () => {
    const store = useProjectStore.getState()
    store.setSource('Color: Red, Blue\n')
    // Build a decision-table set, then switch and build a pairwise set.
    store.setGenerationMode('decision-table')
    store.setTestSuite({
      factorOrder: ['Color'],
      rows: [
        { values: { Color: 'Red' }, forbidden: false },
        { values: { Color: 'Blue' }, forbidden: true },
      ],
    })
    store.setGenerationMode('pairwise')
    store.setTestSuite({
      factorOrder: ['Color'],
      rows: [{ values: { Color: 'Red' }, note: 'keep me' }],
    })
    const text = useProjectStore.getState().toProjectFile()

    useProjectStore.getState().resetToEmpty()
    useProjectStore.getState().loadProjectFile(text)
    const after = useProjectStore.getState()
    // Active mode (pairwise) restored to testSuite; decision set stashed.
    expect(after.generationMode).toBe('pairwise')
    expect(after.testSuite?.rows[0]?.note).toBe('keep me')
    expect(after.inactiveSuite?.rows.some(r => r.forbidden === true)).toBe(true)
    // Switching reveals the restored decision-table set.
    useProjectStore.getState().setGenerationMode('decision-table')
    expect(useProjectStore.getState().testSuite?.rows).toHaveLength(2)
  })

  it('markSaved clears the dirty flag and updates the file path when given', () => {
    useProjectStore.getState().setSource('OS: Linux')
    expect(useProjectStore.getState().isDirty).toBe(true)
    useProjectStore.getState().markSaved('/projects/x.tmodel')
    expect(useProjectStore.getState().isDirty).toBe(false)
    expect(useProjectStore.getState().filePath).toBe('/projects/x.tmodel')
  })
})
