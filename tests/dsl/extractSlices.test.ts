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
    expect(slices).toHaveLength(1)
    expect(slices[0]?.conditionFactors).toEqual(['A', 'B'])
    expect(slices[0]?.constrainedFactor).toBe('C')
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
