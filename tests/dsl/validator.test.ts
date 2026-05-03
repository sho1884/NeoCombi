import { describe, it, expect } from 'vitest'
import { parse } from '../../src/engines/dsl'

describe('validator / undeclared level references', () => {
  it('flags an equality against a level not declared on the factor', () => {
    const r = parse(
      'OS: Linux, Windows\nIF [OS] = "macOS" THEN [OS] <> "Linux";\n',
    )
    expect(r.diagnostics).toHaveLength(1)
    const d = r.diagnostics[0]!
    expect(d.kind).toBe('unknown-level')
    expect(d.severity).toBe('error')
    expect(d.message).toContain('"macOS"')
    expect(d.message).toContain('[OS]')
    expect(d.message).toContain('Linux')
  })

  it('flags an inequality against a level not declared on the factor', () => {
    const r = parse(
      'Browser: Chrome, Firefox\n[Browser] <> "Edge";\n',
    )
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]!.kind).toBe('unknown-level')
  })

  it('flags multiple bad levels in a chained AND on the same factor', () => {
    const r = parse(
      'Margin: なし, 短辺上\n' +
        'IF [Margin] <> "短辺下" AND [Margin] <> "長辺左" THEN [Margin] = "なし";\n',
    )
    const kinds = r.diagnostics.map(d => d.kind).sort()
    expect(kinds).toEqual(['unknown-level', 'unknown-level'])
  })

  it('flags every bad value in an IN clause, but allows valid ones', () => {
    const r = parse(
      'Color: red, green, blue\n[Color] IN { "red", "yellow", "blue", "purple" };\n',
    )
    const bad = r.diagnostics.filter(d => d.kind === 'unknown-level')
    expect(bad).toHaveLength(2)
    const messages = bad.map(d => d.message).sort()
    expect(messages[0]).toContain('"purple"')
    expect(messages[1]).toContain('"yellow"')
  })

  it('does not flag a parameter-to-parameter equality (no level value)', () => {
    const r = parse(
      'A: 1, 2\nB: 1, 2\n[A] = [B];\n',
    )
    expect(r.diagnostics).toEqual([])
  })

  it('does not flag ordering operators (numeric comparison may exceed declared levels)', () => {
    const r = parse(
      'Memory: 4, 8, 16\n[Memory] > 100;\n',
    )
    expect(r.diagnostics).toEqual([])
  })

  it('flags an equality against an undeclared parameter on the LHS', () => {
    const r = parse(
      'OS: Linux\nIF [Browser] = "Chrome" THEN [OS] = "Linux";\n',
    )
    const kinds = r.diagnostics.map(d => d.kind)
    expect(kinds).toContain('unknown-parameter')
  })

  it('flags an equality against an undeclared parameter on the RHS', () => {
    const r = parse(
      'OS: Linux\n[OS] = [Other];\n',
    )
    const unknownParam = r.diagnostics.find(d => d.kind === 'unknown-parameter')
    expect(unknownParam).toBeTruthy()
    expect(unknownParam!.message).toContain('[Other]')
  })

  it('passes a model whose constraints only reference declared levels', () => {
    const r = parse(
      'OS: Linux, Windows, macOS\nBrowser: Chrome, Safari\n' +
        'IF [OS] = "Linux" THEN [Browser] <> "Safari";\n',
    )
    expect(r.diagnostics).toEqual([])
  })

  it('reproduces the binding-margin bug: levels referenced but not declared', () => {
    // とじしろ has only 4 declared levels; the constraint references several
    // that were never declared (短辺下 / 長辺左 / 長辺右 / 長辺上 / 長辺下).
    // Each undeclared reference should surface as its own diagnostic.
    const r = parse(
      [
        '原稿の向き : たて, よこ',
        'とじしろ : なし, 短辺上, 短辺左, 短辺右',
        'IF [原稿の向き] = "よこ" THEN [とじしろ] <> "短辺上" AND [とじしろ] <> "短辺下" AND [とじしろ] <> "長辺左" AND [とじしろ] <> "長辺右";',
      ].join('\n') + '\n',
    )
    const undeclared = r.diagnostics
      .filter(d => d.kind === 'unknown-level')
      .map(d => d.message)
    // 3 of the 4 chained references are bad: 短辺下, 長辺左, 長辺右.
    // 短辺上 is declared so it should NOT trigger.
    expect(undeclared).toHaveLength(3)
    expect(undeclared.some(m => m.includes('"短辺下"'))).toBe(true)
    expect(undeclared.some(m => m.includes('"長辺左"'))).toBe(true)
    expect(undeclared.some(m => m.includes('"長辺右"'))).toBe(true)
    expect(undeclared.some(m => m.includes('"短辺上"'))).toBe(false)
  })
})
