import { describe, it, expect } from 'vitest'
import { parse } from '../../src/engines/dsl'
import {
  aliasForPict,
  hasNonAscii,
  modelNeedsAliasing,
  unaliasTsv,
} from '../../src/services/asciiAlias'

function aliasFromSource(source: string) {
  const { model } = parse(source)
  if (!model) throw new Error('parse failed')
  return aliasForPict(source, model)
}

describe('asciiAlias / hasNonAscii', () => {
  it('returns false for plain ASCII strings', () => {
    expect(hasNonAscii('OS')).toBe(false)
    expect(hasNonAscii('Browser_v2')).toBe(false)
    expect(hasNonAscii('123-abc')).toBe(false)
  })

  it('returns true for any non-ASCII character', () => {
    expect(hasNonAscii('原稿の向き')).toBe(true)
    expect(hasNonAscii('OS Versión')).toBe(true) // accented Latin
    expect(hasNonAscii('mixed たて value')).toBe(true)
  })
})

describe('asciiAlias / modelNeedsAliasing', () => {
  it('is false when every factor and level is ASCII', () => {
    const { model } = parse('OS: Linux, Windows\nBrowser: Chrome, Safari\n')
    expect(modelNeedsAliasing(model!)).toBe(false)
  })

  it('is true if a factor name is multibyte', () => {
    const { model } = parse('向き: tate, yoko\n')
    expect(modelNeedsAliasing(model!)).toBe(true)
  })

  it('is true if a level value is multibyte', () => {
    const { model } = parse('Direction: たて, よこ\n')
    expect(modelNeedsAliasing(model!)).toBe(true)
  })
})

describe('asciiAlias / aliasForPict', () => {
  it('returns the source unchanged when the model is all ASCII', () => {
    const src = 'OS: Linux, Windows\nIF [OS] = "Linux" THEN [OS] <> "Windows";\n'
    const { source, aliasMap } = aliasFromSource(src)
    expect(source).toBe(src)
    expect(aliasMap.factor.size).toBe(0)
    expect(aliasMap.level.size).toBe(0)
  })

  it('aliases a multibyte factor name and preserves ASCII names', () => {
    const { source, aliasMap } = aliasFromSource(
      '向き: tate, yoko\nA: v1, v2\n',
    )
    // "向き" was renamed; "A" stayed.
    expect(aliasMap.factor.get('向き')).toBe('_F1')
    expect(aliasMap.factor.has('A')).toBe(false)
    expect(source).toContain('_F1: tate, yoko')
    expect(source).toContain('A: v1, v2')
  })

  it('aliases multibyte level values within a quoted string literal', () => {
    const src = 'Direction: たて, よこ\n[Direction] = "たて";\n'
    const { source, aliasMap } = aliasFromSource(src)
    const levels = aliasMap.level.get('Direction')!
    expect(levels.get('たて')).toBe('_L1')
    expect(levels.get('よこ')).toBe('_L2')
    // Both the declaration AND the constraint literal are rewritten.
    expect(source).toContain('Direction: _L1, _L2')
    expect(source).toContain('[Direction] = "_L1"')
  })

  it('rewrites parameter references inside constraints and IN clauses', () => {
    const src =
      '向き: たて, よこ\n両面: しない, 短辺とじ\n' +
      'IF [向き] = "よこ" AND [両面] IN { "短辺とじ" } THEN [向き] <> "たて";\n'
    const { source, aliasMap } = aliasFromSource(src)
    expect(aliasMap.factor.get('向き')).toBe('_F1')
    expect(aliasMap.factor.get('両面')).toBe('_F2')
    expect(source).toContain('IF [_F1] = "_L2"')
    expect(source).toContain('AND [_F2] IN { "_L2" }')
    expect(source).toContain('THEN [_F1] <> "_L1"')
  })

  it('keeps level numbering local to each factor', () => {
    const { aliasMap } = aliasFromSource('A向き: たて\nB両面: しない\n')
    expect(aliasMap.level.get('A向き')!.get('たて')).toBe('_L1')
    expect(aliasMap.level.get('B両面')!.get('しない')).toBe('_L1')
  })
})

describe('asciiAlias / unaliasTsv', () => {
  it('passes the TSV through unchanged when the alias map is empty', () => {
    const { aliasMap } = aliasFromSource('OS: Linux, Windows\n')
    const tsv = 'OS\nLinux\nWindows\n'
    expect(unaliasTsv(tsv, aliasMap)).toBe(tsv)
  })

  it('restores aliased factor names in the header row', () => {
    const { aliasMap } = aliasFromSource('向き: tate, yoko\nA: v1, v2\n')
    const tsv = '_F1\tA\ntate\tv1\nyoko\tv2\n'
    expect(unaliasTsv(tsv, aliasMap)).toBe('向き\tA\ntate\tv1\nyoko\tv2\n')
  })

  it('restores aliased level values per factor column', () => {
    const { aliasMap } = aliasFromSource(
      '向き: たて, よこ\n両面: しない, 短辺とじ\n',
    )
    const tsv = '_F1\t_F2\n_L1\t_L1\n_L2\t_L2\n_L1\t_L2\n'
    expect(unaliasTsv(tsv, aliasMap)).toBe(
      '向き\t両面\nたて\tしない\nよこ\t短辺とじ\nたて\t短辺とじ\n',
    )
  })

  it('roundtrips a small mixed model: alias → fake PICT output → unalias', () => {
    // Simulate PICT's TSV by taking the rewritten model and producing a
    // plausible 2-row output. The cells use the aliases produced by
    // aliasForPict; unaliasing should restore the original names exactly.
    const src = 'A: v1, v2\n向き: たて, よこ\n'
    const { aliasMap } = aliasFromSource(src)
    const fakePictTsv = 'A\t_F1\nv1\t_L2\nv2\t_L1\n'
    expect(unaliasTsv(fakePictTsv, aliasMap)).toBe(
      'A\t向き\nv1\tよこ\nv2\tたて\n',
    )
  })
})
