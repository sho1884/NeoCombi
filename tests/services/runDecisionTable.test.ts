import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../src/stores/projectStore'
import { runDecisionTable } from '../../src/services/runDecisionTable'

beforeEach(() => {
  useProjectStore.getState().resetToEmpty()
})

describe('runDecisionTable (GUI path)', () => {
  it('populates the test suite with every combination and marks forbidden rows', () => {
    useProjectStore.getState().setSource(
      'Color: Red, Blue\nSize: S, M, L\nIF [Color] = "Red" THEN [Size] <> "L";',
    )
    const result = runDecisionTable()
    expect(result.kind).toBe('ok')

    const suite = useProjectStore.getState().testSuite
    expect(suite).not.toBeNull()
    expect(suite!.factorOrder).toEqual(['Color', 'Size'])
    expect(suite!.rows).toHaveLength(6) // forbidden rows are kept
    const redL = suite!.rows.find(r => r.values['Color'] === 'Red' && r.values['Size'] === 'L')
    expect(redL?.forbidden).toBe(true)
    expect(suite!.rows.filter(r => r.forbidden).length).toBe(1)
  })

  it('reports too-large without populating a suite', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `v${i}`).join(', ')
    useProjectStore.getState().setSource(`A: ${ten}\nB: ${ten}\nC: ${ten}\nD: ${ten}`)
    const result = runDecisionTable()
    expect(result.kind).toBe('too-large')
    if (result.kind !== 'too-large') return
    expect(result.count).toBe(10000)
    expect(useProjectStore.getState().testSuite).toBeNull()
  })

  it('skips when the DSL has errors', () => {
    useProjectStore.getState().setSource('A: 1, 2\nIF [Nope] = "x" THEN')
    expect(runDecisionTable().kind).toBe('skipped')
  })
})

describe('projectStore / generationMode', () => {
  it('switching mode preserves both sets (swaps active <-> stash)', () => {
    const store = useProjectStore.getState()
    store.setSource('A: 1, 2\nB: x, y')
    store.setGenerationMode('decision-table')
    runDecisionTable()
    const dt = useProjectStore.getState().testSuite
    expect(dt).not.toBeNull()

    // Switch to pairwise: the decision set is stashed, the active slot is empty.
    store.setGenerationMode('pairwise')
    expect(useProjectStore.getState().generationMode).toBe('pairwise')
    expect(useProjectStore.getState().testSuite).toBeNull()
    expect(useProjectStore.getState().inactiveSuite).toBe(dt)
    expect(useProjectStore.getState().isDirty).toBe(true)

    // Switch back: the decision set is restored verbatim, not regenerated.
    store.setGenerationMode('decision-table')
    expect(useProjectStore.getState().testSuite).toBe(dt)
  })

  it('preserves the forbidden flag when editing a note', () => {
    useProjectStore.getState().setSource(
      'Color: Red, Blue\nSize: S, M, L\nIF [Color] = "Red" THEN [Size] <> "L";',
    )
    runDecisionTable()
    const suite = useProjectStore.getState().testSuite!
    const idx = suite.rows.findIndex(r => r.forbidden)
    expect(idx).toBeGreaterThanOrEqual(0)
    useProjectStore.getState().setTestCaseNote(idx, 'should never run')
    const after = useProjectStore.getState().testSuite!.rows[idx]!
    expect(after.forbidden).toBe(true)
    expect(after.note).toBe('should never run')
  })
})
