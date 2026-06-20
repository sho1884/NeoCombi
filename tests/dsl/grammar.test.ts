import { describe, it, expect } from 'vitest'
import { DSL_GRAMMAR_EBNF, DSL_GRAMMAR_VERSION } from '../../src/engines/dsl/grammar'

describe('DSL grammar constant', () => {
  it('is version 1.0', () => {
    expect(DSL_GRAMMAR_VERSION).toBe('1.0')
    expect(DSL_GRAMMAR_EBNF).toContain('Version 1.0')
  })

  it('contains the core production rules', () => {
    for (const rule of ['Model', 'ParameterDecl', 'Constraint', 'IfStatement', 'Comparison', 'InClause']) {
      expect(DSL_GRAMMAR_EBNF).toContain(`${rule} `)
    }
  })

  it('keeps backslash escapes literal (String.raw)', () => {
    // If interpolation had eaten them, these literal sequences would be gone.
    expect(DSL_GRAMMAR_EBNF).toContain(String.raw`[^\r\n]`)
    expect(DSL_GRAMMAR_EBNF).toContain(String.raw`'\r'? '\n'`)
    expect(DSL_GRAMMAR_EBNF).not.toContain('\r')
  })

  it('carries the authoring pragmatics and a worked example', () => {
    expect(DSL_GRAMMAR_EBNF).toContain('Authoring notes')
    expect(DSL_GRAMMAR_EBNF).toContain('output ONLY text conforming to this grammar')
    // the mask convention is taught by example, not just prose
    expect(DSL_GRAMMAR_EBNF).toContain('_MASK_')
    expect(DSL_GRAMMAR_EBNF).toContain('IF [Payment] <> "CreditCard" THEN [CardStatus] =  "_MASK_";')
  })
})
