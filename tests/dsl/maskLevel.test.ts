import { describe, it, expect } from 'vitest'
import { MASK_LEVEL, isMaskLevel, isMaskLevelNode } from '../../src/engines/dsl'
import { parse } from '../../src/engines/dsl'

describe('mask-level helpers (SR-090)', () => {
  it('exposes _MASK_ as the canonical sentinel value', () => {
    expect(MASK_LEVEL).toBe('_MASK_')
  })

  it('isMaskLevel matches only the exact sentinel string', () => {
    expect(isMaskLevel('_MASK_')).toBe(true)
    expect(isMaskLevel('mask')).toBe(false)
    expect(isMaskLevel('MASK')).toBe(false)
    expect(isMaskLevel('_mask_')).toBe(false)
    expect(isMaskLevel('_MASK')).toBe(false)
    expect(isMaskLevel('MASK_')).toBe(false)
    expect(isMaskLevel('prefix_MASK_')).toBe(false)
    expect(isMaskLevel('_MASK_suffix')).toBe(false)
    expect(isMaskLevel('')).toBe(false)
  })

  it('isMaskLevel rejects numeric input even when stringified to the sentinel', () => {
    // The level value type union allows number; a numeric value can never
    // equal the underscore-bracketed sentinel.
    expect(isMaskLevel(0)).toBe(false)
    expect(isMaskLevel(123)).toBe(false)
  })

  it('isMaskLevelNode accepts both bare-identifier and quoted-string forms', () => {
    // Bare form (the canonical authoring path — emitted by addLevelToFactor
    // and what passes through to PICT directly).
    const r1 = parse('Card: 1, 2, _MASK_\n')
    expect(r1.model).not.toBeNull()
    const card1 = r1.model!.parameters[0]!
    const [n1, n2, mask1] = card1.levels
    expect(isMaskLevelNode(n1!)).toBe(false)
    expect(isMaskLevelNode(n2!)).toBe(false)
    expect(isMaskLevelNode(mask1!)).toBe(true)

    // Quoted form (legal in our DSL grammar; rare but still recognized).
    const r2 = parse('Card: 1, 2, "_MASK_"\n')
    expect(r2.model).not.toBeNull()
    const card2 = r2.model!.parameters[0]!
    const mask2 = card2.levels[2]!
    expect(isMaskLevelNode(mask2)).toBe(true)
  })

  it('does not treat a bare identifier "MASK" (no underscores) as the mask sentinel', () => {
    // PICT-PAPP uses "MASK" but NeoCombi's sentinel is "_MASK_" — the
    // underscores avoid collision with author-chosen levels named MASK.
    const r = parse('Card: 1, 2, MASK\n')
    expect(r.model).not.toBeNull()
    const card = r.model!.parameters[0]!
    expect(card.levels.every(l => !isMaskLevelNode(l))).toBe(true)
  })
})

describe('validator / unbound mask level (SR-092)', () => {
  it('warns when a factor declares _MASK_ but no constraint pins it', () => {
    const r = parse(
      'Pay: cash, card\nCard: 1234, _MASK_\nIF [Pay] = "cash" THEN [Card] <> "1234";\n',
    )
    const warnings = r.diagnostics.filter(d => d.kind === 'unbound-mask-level')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.severity).toBe('warning')
    expect(warnings[0]!.message).toContain('[Card]')
    expect(warnings[0]!.message).toContain('_MASK_')
  })

  it('does not warn when an IF-THEN equality binds the factor to _MASK_', () => {
    const r = parse(
      'Pay: cash, card\nCard: 1234, _MASK_\nIF [Pay] = "cash" THEN [Card] = "_MASK_";\n',
    )
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
  })

  it('does not warn when an IN clause includes _MASK_', () => {
    const r = parse(
      'Pay: cash, wire, card\n' +
        'Card: 1234, _MASK_\n' +
        'IF [Pay] IN { "cash", "wire" } THEN [Card] IN { "_MASK_" };\n',
    )
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
  })

  it('does not warn when an unconditional equality pins the factor', () => {
    const r = parse(
      'Card: 1234, _MASK_\n[Card] = "_MASK_";\n',
    )
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
  })

  it('does not warn for a factor that has no mask level', () => {
    const r = parse('OS: Linux, Windows\nIF [OS] = "Linux" THEN [OS] <> "Windows";\n')
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
  })

  it('does not treat _MASK_ in a condition (left side equality) as binding', () => {
    // IF [Card] = "_MASK_" THEN ... uses _MASK_ as a condition trigger,
    // which still counts as the author having "wired in" the state — we
    // accept this generously for a warning. The intent is to catch
    // declarations that nothing references at all.
    const r = parse(
      'Card: 1234, _MASK_\nLog: yes, no\nIF [Card] = "_MASK_" THEN [Log] = "no";\n',
    )
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
  })

  it('does not count an inequality (<>) against _MASK_ as binding', () => {
    // Saying "Card is not _MASK_" never assigns Card to _MASK_, so the
    // sentinel is still effectively dead in the model.
    const r = parse(
      'Pay: cash, card\nCard: 1234, _MASK_\nIF [Pay] = "card" THEN [Card] <> "_MASK_";\n',
    )
    const warnings = r.diagnostics.filter(d => d.kind === 'unbound-mask-level')
    expect(warnings).toHaveLength(1)
  })

  it('warns once per unbound mask factor, not per constraint', () => {
    const r = parse(
      'Pay: cash, card\n' +
        'Card: 1234, _MASK_\n' +
        'CVV: 100, _MASK_\n' +
        'IF [Pay] = "cash" THEN [Card] <> "1234";\n',
    )
    // Both Card and CVV declare _MASK_ with no binding — exactly two warnings.
    expect(r.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(2)
  })

  it('only recognizes the quoted form as a binding — bare _MASK_ is a syntax error', () => {
    // Constraint references must be quoted (PICT requires it; the parser
    // mirrors that — see DSL_Grammar_Specification.md §4 Value rule).
    const quoted = parse(
      'Pay: cash, card\nCard: 1234, _MASK_\nIF [Pay] = "cash" THEN [Card] = "_MASK_";\n',
    )
    expect(quoted.diagnostics.filter(d => d.kind === 'unbound-mask-level')).toHaveLength(0)
    expect(quoted.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
    // The bare form fails to parse; the unbound-mask-level warning then
    // also fires because the (would-be) binding never makes it into the AST.
    const bare = parse(
      'Pay: cash, card\nCard: 1234, _MASK_\nIF [Pay] = "cash" THEN [Card] = _MASK_;\n',
    )
    const syntaxErrors = bare.diagnostics.filter(d => d.kind === 'syntax')
    expect(syntaxErrors).toHaveLength(1)
    expect(syntaxErrors[0]!.message).toContain('_MASK_')
    expect(syntaxErrors[0]!.message).toContain('quoted')
  })
})
