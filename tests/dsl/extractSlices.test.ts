import { describe, it, expect } from 'vitest'
import { parse, extractSuggestedSlices } from '../../src/engines/dsl'

function suggest(src: string) {
  const { model } = parse(src)
  if (!model) throw new Error('Parse failed')
  return extractSuggestedSlices(model)
}

describe('extractSuggestedSlices', () => {
  it('emits one slice per simple IF / THEN constraint', () => {
    const slices = suggest(
      'OS: Linux, Windows\n' +
        'Browser: Chrome, Safari\n' +
        'IF [OS] = "Linux" THEN [Browser] <> "Safari";\n',
    )
    expect(slices).toEqual([
      { conditionFactors: ['OS'], constrainedFactor: 'Browser' },
    ])
  })

  it('emits both consequence factors when ELSE references a different one', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1 ELSE [C] = 1;\n',
    )
    const set = new Set(
      slices.map(s => s.conditionFactors.join('|') + '->' + s.constrainedFactor),
    )
    expect(set).toContain('A->B')
    expect(set).toContain('A->C')
  })

  it('keeps multiple condition factors together on the row axis', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\n' +
        'IF [A] = 1 AND [B] = 1 THEN [C] = 1;\n',
    )
    // The per-constraint slice keeps the AND'd condition factors together.
    const perConstraint = slices.find(
      s => s.constrainedFactor === 'C' && s.conditionFactors.length === 2,
    )
    expect(perConstraint?.conditionFactors).toEqual(['A', 'B'])
    expect(perConstraint?.constrainedFactor).toBe('C')
    // The {A, B, C} component is size 3, so propagation also pivots
    // each factor as constrained against the other two.
    const set = new Set(
      slices.map(s => [...s.conditionFactors].sort().join('|') + '->' + s.constrainedFactor),
    )
    expect(set).toContain('A|B->C')
    expect(set).toContain('A|C->B')
    expect(set).toContain('B|C->A')
  })

  it('treats an unconditional Predicate as a slice over the factors it touches', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\n' +
        '[A] <> 1 OR [B] <> 1;\n',
    )
    expect(slices).toEqual([
      { conditionFactors: ['A'], constrainedFactor: 'B' },
    ])
  })

  it('skips single-factor unconditional constraints', () => {
    const slices = suggest('A: 1, 2\n[A] <> 1;\n')
    expect(slices).toEqual([])
  })

  it('deduplicates identical (conditions -> constrained) pairs across constraints', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1;\n' +
        'IF [A] = 2 THEN [B] = 2;\n',
    )
    expect(slices).toHaveLength(1)
  })

  it('returns an empty list when the model has no constraints', () => {
    expect(suggest('A: 1, 2\nB: x, y\n')).toEqual([])
  })

  it('falls back to per-factor pivots when THEN / ELSE only use condition factors', () => {
    // The condition and consequence both reference A only — a degenerate
    // "self-restriction" that pivots into multiple slices when combined with
    // other condition factors. With only one factor in the condition, we
    // emit no slice (no other axis to pivot against).
    const a = suggest('A: 1, 2\nIF [A] = 1 THEN [A] <> 2;\n')
    expect(a).toEqual([])
    // With two factors in the condition referencing each other, the helper
    // pivots each as constrained against the other.
    const b = suggest(
      'A: 1, 2\nB: 1, 2\nIF [A] = 1 AND [B] = 1 THEN [A] = 1 OR [B] = 1;\n',
    )
    const pairs = new Set(
      b.map(s => s.conditionFactors.join('|') + '->' + s.constrainedFactor),
    )
    expect(pairs).toContain('B->A')
    expect(pairs).toContain('A->B')
  })
})

describe('extractSuggestedSlices / propagation across constraints', () => {
  function pairs(slices: { conditionFactors: string[]; constrainedFactor: string | null }[]) {
    return new Set(
      slices.map(
        s => [...s.conditionFactors].sort().join('|') + '->' + s.constrainedFactor,
      ),
    )
  }

  it('chains A → B and B → C into a propagation slice (A, B → C) and pivots', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1;\n' +
        'IF [B] = 1 THEN [C] = 0;\n',
    )
    const got = pairs(slices)
    // Per-constraint slices.
    expect(got).toContain('A->B')
    expect(got).toContain('B->C')
    // Propagation slices: every pivot inside the {A, B, C} component.
    expect(got).toContain('A|B->C')
    expect(got).toContain('A|C->B')
    expect(got).toContain('B|C->A')
  })

  it('does not propagate across disjoint constraint groups', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\nD: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1;\n' +
        'IF [C] = 1 THEN [D] = 1;\n',
    )
    const got = pairs(slices)
    expect(got).toContain('A->B')
    expect(got).toContain('C->D')
    // No cross-component propagation suggested.
    expect(got.has('A|C->B')).toBe(false)
    expect(got.has('A|D->B')).toBe(false)
    expect(got.has('B|C->D')).toBe(false)
  })

  it('extends a 4-factor chain into all four pivots', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\nD: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1;\n' +
        'IF [B] = 1 THEN [C] = 1;\n' +
        'IF [C] = 1 THEN [D] = 1;\n',
    )
    const got = pairs(slices)
    expect(got).toContain('A|B|C->D')
    expect(got).toContain('A|B|D->C')
    expect(got).toContain('A|C|D->B')
    expect(got).toContain('B|C|D->A')
  })

  it('handles a fork (A → B, A → C) as one component {A, B, C}', () => {
    const slices = suggest(
      'A: 1, 2\nB: 1, 2\nC: 1, 2\n' +
        'IF [A] = 1 THEN [B] = 1;\n' +
        'IF [A] = 2 THEN [C] = 1;\n',
    )
    const got = pairs(slices)
    expect(got).toContain('A->B')
    expect(got).toContain('A->C')
    // The shared factor A pulls B and C into one component.
    expect(got).toContain('A|B->C')
    expect(got).toContain('A|C->B')
    expect(got).toContain('B|C->A')
  })
})
