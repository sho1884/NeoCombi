import { describe, it, expect } from 'vitest'
import {
  serialize,
  deserialize,
  stripAnnotations,
} from '../../src/services/tmodelFile'
import type { ExpectedValueEntry } from '../../src/types/project'

describe('tmodelFile / serialize', () => {
  it('emits source as-is when there are no annotations to add', () => {
    const text = serialize({
      source: 'OS: Linux, Windows\n',
      expectedValues: [],
      pictOrder: 2, // default — should NOT be emitted
      generationMode: 'pairwise',
    })
    expect(text).toBe('OS: Linux, Windows\n')
  })

  it('omits the order annotation when value equals default (2)', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).not.toContain('@neocombi:order')
  })

  it('emits the order annotation when value differs from default', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [],
      pictOrder: 3,
      generationMode: 'pairwise',
    })
    expect(text).toContain('# @neocombi:order 3')
  })

  it('emits expected-value annotations after a header separator', () => {
    const text = serialize({
      source: 'OS: Linux, Windows\nBrowser: Chrome, Safari\n',
      expectedValues: [
        { assignment: { OS: 'Linux', Browser: 'Chrome' }, value: 'Renders OK' },
      ],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).toContain('# ===== NeoCombi annotations')
    expect(text).toContain('# @neocombi:expected OS=Linux Browser=Chrome | Renders OK')
  })

  it('escapes pipes inside expected-value text', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [
        { assignment: { A: '1' }, value: 'before | after' },
      ],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).toContain('before \\| after')
  })

  it('collapses newlines inside expected-value text to spaces', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [
        { assignment: { A: '1' }, value: 'line one\nline two' },
      ],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).toContain('line one line two')
    expect(text).not.toMatch(/line one\nline two/)
  })

  it('strips stale annotations from the input source before re-emitting', () => {
    // If the caller (incorrectly) leaves an old annotation in source, the
    // serializer must not re-emit it — only structured fields drive output.
    const text = serialize({
      source: 'A: 1, 2\n# @neocombi:order 9\n',
      expectedValues: [],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).not.toContain('order 9')
  })
})

describe('tmodelFile / deserialize', () => {
  it('extracts default order when no order annotation is present', () => {
    const r = deserialize('OS: Linux, Windows\n')
    expect(r.pictOrder).toBe(2)
    expect(r.source).toBe('OS: Linux, Windows\n')
    expect(r.expectedValues).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('extracts custom order annotation', () => {
    const r = deserialize('# @neocombi:order 3\nA: 1, 2\n')
    expect(r.pictOrder).toBe(3)
    expect(r.source).toBe('A: 1, 2\n')
  })

  it('extracts expected-value annotation', () => {
    const r = deserialize(
      [
        'OS: Linux, Windows',
        '# @neocombi:expected OS=Linux | runs OK',
        '',
      ].join('\n'),
    )
    expect(r.expectedValues).toEqual([
      { assignment: { OS: 'Linux' }, value: 'runs OK' },
    ])
  })

  it('preserves ordinary user comments in source', () => {
    const r = deserialize('# user note\nOS: Linux\n')
    expect(r.source).toContain('# user note')
  })

  it('drops the auto-generated annotations header line', () => {
    const r = deserialize(
      [
        'OS: Linux',
        '',
        '# ===== NeoCombi annotations (auto-generated; do not edit) =====',
        '# @neocombi:order 4',
      ].join('\n'),
    )
    expect(r.source).not.toContain('===== NeoCombi annotations')
    expect(r.pictOrder).toBe(4)
  })

  it('reports warnings for malformed annotations without crashing', () => {
    const r = deserialize(
      [
        '# @neocombi:order',
        '# @neocombi:expected no_pipe_here',
        '# @neocombi:unknown thing',
      ].join('\n'),
    )
    expect(r.warnings).toHaveLength(3)
    expect(r.warnings[0]?.reason).toMatch(/order/)
    expect(r.warnings[1]?.reason).toMatch(/expected/)
    expect(r.warnings[2]?.reason).toMatch(/unknown/)
  })

  it('decodes escaped pipes in expected-value text', () => {
    const r = deserialize('# @neocombi:expected A=1 | a \\| b')
    expect(r.expectedValues[0]?.value).toBe('a | b')
  })
})

describe('tmodelFile / round-trip', () => {
  it('serialize ∘ deserialize is identity on the structured fields', () => {
    const input = {
      source: 'OS: Linux, Windows\nBrowser: Chrome, Safari\nIF [OS] = "Linux" THEN [Browser] <> "Safari";\n',
      expectedValues: [
        { assignment: { OS: 'Linux', Browser: 'Chrome' }, value: 'Renders OK' },
        { assignment: { OS: 'Windows', Browser: 'Safari' }, value: 'Edge case' },
      ] satisfies ExpectedValueEntry[],
      pictOrder: 3,
      generationMode: 'decision-table' as const,
    }
    const text = serialize(input)
    const back = deserialize(text)
    expect(back.source).toBe(input.source)
    expect(back.expectedValues).toEqual(input.expectedValues)
    expect(back.pictOrder).toBe(input.pictOrder)
    expect(back.generationMode).toBe(input.generationMode)
    expect(back.warnings).toEqual([])
  })
})

describe('tmodelFile / generation mode', () => {
  it('omits the mode annotation for the default (pairwise)', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [],
      pictOrder: 2,
      generationMode: 'pairwise',
    })
    expect(text).not.toContain('@neocombi:mode')
  })

  it('emits and re-reads the decision-table mode', () => {
    const text = serialize({
      source: 'A: 1, 2',
      expectedValues: [],
      pictOrder: 2,
      generationMode: 'decision-table',
    })
    expect(text).toContain('# @neocombi:mode decision-table')
    expect(deserialize(text).generationMode).toBe('decision-table')
  })

  it('defaults to pairwise when no mode annotation is present', () => {
    expect(deserialize('A: 1, 2\n').generationMode).toBe('pairwise')
  })

  it('warns on a malformed mode annotation', () => {
    const r = deserialize('# @neocombi:mode sideways\nA: 1\n')
    expect(r.generationMode).toBe('pairwise')
    expect(r.warnings.some(w => /mode/.test(w.reason))).toBe(true)
  })
})

describe('tmodelFile / stripAnnotations', () => {
  it('removes only @neocombi annotation lines and the auto-generated header', () => {
    const cleaned = stripAnnotations(
      [
        'OS: Linux',
        '# user comment',
        '# @neocombi:order 5',
        '# ===== NeoCombi annotations =====',
        '# @neocombi:expected OS=Linux | hi',
        'Browser: Chrome',
      ].join('\n'),
    )
    expect(cleaned).toBe(
      [
        'OS: Linux',
        '# user comment',
        'Browser: Chrome',
      ].join('\n'),
    )
  })
})
