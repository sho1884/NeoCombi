import { describe, it, expect } from 'vitest'
import { parse } from '../../src/engines/dsl/parser'
import type {
  Comparison,
  IfStatement,
  InClause,
  AndExpr,
  OrExpr,
  NotExpr,
  UnconditionalConstraint,
} from '../../src/types/dsl'

describe('parser / parameter declarations', () => {
  it('parses a single parameter with comma-separated levels', () => {
    const { model, diagnostics } = parse('OS: Windows, Linux, macOS')
    expect(diagnostics).toEqual([])
    expect(model?.parameters).toHaveLength(1)
    const p = model!.parameters[0]!
    expect(p.name).toBe('OS')
    expect(p.levels.map(l => l.value)).toEqual(['Windows', 'Linux', 'macOS'])
  })

  it('parses multiple parameters across newlines', () => {
    const src = `
OS: Windows, Linux
Browser: Chrome, Firefox
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    expect(model?.parameters.map(p => p.name)).toEqual(['OS', 'Browser'])
  })

  it('parses string and number levels', () => {
    const { model, diagnostics } = parse('Memory: 4, 8, 16\nLabel: "alpha", "beta"')
    expect(diagnostics).toEqual([])
    expect(model?.parameters[0]!.levels.map(l => l.type)).toEqual([
      'number', 'number', 'number',
    ])
    expect(model?.parameters[1]!.levels.map(l => l.type)).toEqual(['string', 'string'])
  })

  it('preserves multi-word parameter names', () => {
    const { model } = parse('OS Version: 11, 10')
    expect(model?.parameters[0]!.name).toBe('OS Version')
  })
})

describe('parser / IF constraints', () => {
  it('parses a basic IF/THEN constraint', () => {
    const src = `
OS: Linux, Windows
Browser: Safari, Chrome
IF [OS] = "Linux" THEN [Browser] <> "Safari";
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    expect(model?.constraints).toHaveLength(1)
    const c = model!.constraints[0] as IfStatement
    expect(c.type).toBe('if')
    expect((c.condition as Comparison).op).toBe('=')
    expect((c.then as Comparison).op).toBe('<>')
  })

  it('parses IF/THEN/ELSE', () => {
    const src = `
Auth: OAuth, None
HTTPS: Yes, No
IF [Auth] = "OAuth" THEN [HTTPS] = "Yes" ELSE [HTTPS] = "No";
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const c = model!.constraints[0] as IfStatement
    expect(c.else).not.toBeNull()
  })

  it('parses unconditional constraint (Predicate;)', () => {
    const src = `
Status: A, B
[Status] = "A";
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const c = model!.constraints[0] as UnconditionalConstraint
    expect(c.type).toBe('unconditional')
  })
})

describe('parser / logical operators and precedence', () => {
  it('handles AND with higher precedence than OR', () => {
    // [a]=1 OR [b]=1 AND [c]=1 should parse as [a]=1 OR ([b]=1 AND [c]=1)
    const src = `
A: 0, 1
B: 0, 1
C: 0, 1
IF [A] = 1 OR [B] = 1 AND [C] = 1 THEN [A] = 1;
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const cond = (model!.constraints[0] as IfStatement).condition as OrExpr
    expect(cond.type).toBe('or')
    expect(cond.right.type).toBe('and')
  })

  it('handles NOT as unary higher-precedence operator', () => {
    const src = `
A: 0, 1
B: 0, 1
IF NOT [A] = 1 AND [B] = 1 THEN [A] = 0;
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const cond = (model!.constraints[0] as IfStatement).condition as AndExpr
    expect(cond.type).toBe('and')
    expect((cond.left as NotExpr).type).toBe('not')
  })

  it('respects parentheses', () => {
    const src = `
A: 0, 1
B: 0, 1
C: 0, 1
IF ([A] = 1 OR [B] = 1) AND [C] = 1 THEN [A] = 1;
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const cond = (model!.constraints[0] as IfStatement).condition as AndExpr
    expect(cond.type).toBe('and')
    expect((cond.left as OrExpr).type).toBe('or')
  })
})

describe('parser / IN clause', () => {
  it('parses IN with multiple values', () => {
    const src = `
OS: Windows, Linux, macOS, FreeBSD
Cloud: AWS, Azure
IF [OS] IN { "Linux", "FreeBSD" } THEN [Cloud] <> "Azure";
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const cond = (model!.constraints[0] as IfStatement).condition as InClause
    expect(cond.type).toBe('in')
    expect(cond.values.map(v => v.value)).toEqual(['Linux', 'FreeBSD'])
  })
})

describe('parser / parameter-to-parameter comparison', () => {
  it('parses [Param] op [Param]', () => {
    const src = `
Min: 1, 2, 3
Max: 1, 2, 3
IF [Min] > [Max] THEN [Min] = [Max];
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics).toEqual([])
    const cond = (model!.constraints[0] as IfStatement).condition as Comparison
    expect(cond.right.type).toBe('paramRef')
  })
})

describe('parser / MVP-unsupported syntax produces diagnostics', () => {
  it('reports LIKE as unsupported-mvp', () => {
    const src = `
File: a, b
IF [File] LIKE "*.tmp" THEN [File] = a;
    `
    const { diagnostics } = parse(src)
    const d = diagnostics.find(x => x.kind === 'unsupported-mvp')
    expect(d).toBeDefined()
    expect(d?.message).toMatch(/LIKE/)
  })

  it('reports level weight (N) as unsupported-mvp', () => {
    const src = 'OS: Windows (5), Linux (1)'
    const { diagnostics } = parse(src)
    const ds = diagnostics.filter(x => x.kind === 'unsupported-mvp')
    expect(ds).toHaveLength(2)
    expect(ds[0]?.message).toMatch(/weight/)
  })

  it('reports negative-value ~ as unsupported-mvp', () => {
    const src = 'Counter: ~-1, 0, 1'
    const { diagnostics } = parse(src)
    const d = diagnostics.find(x => x.kind === 'unsupported-mvp')
    expect(d).toBeDefined()
    expect(d?.message).toMatch(/Negative|~/)
  })

  it('reports submodel { ... } @ N as unsupported-mvp', () => {
    const src = `
A: 1, 2
B: 1, 2
{ A, B } @ 2
    `
    const { diagnostics } = parse(src)
    expect(diagnostics.some(d => d.kind === 'unsupported-mvp')).toBe(true)
  })
})

describe('parser / syntax errors carry positions', () => {
  it('reports missing colon in parameter declaration', () => {
    const src = 'OS Windows, Linux'
    const { diagnostics } = parse(src)
    const d = diagnostics.find(x => x.kind === 'syntax')
    expect(d).toBeDefined()
    expect(d?.range.start.line).toBe(1)
  })

  it('reports missing semicolon at end of constraint', () => {
    const src = `
OS: Linux
[OS] = "Linux"
    `
    const { diagnostics } = parse(src)
    expect(diagnostics.some(d => d.kind === 'syntax' && /;/.test(d.message))).toBe(true)
  })

  it('recovers from a bad constraint to parse subsequent ones', () => {
    const src = `
A: 1, 2
[A] = ; # syntax error
[A] = 2;
    `
    const { model, diagnostics } = parse(src)
    expect(diagnostics.some(d => d.kind === 'syntax')).toBe(true)
    // Should still recover and parse the second constraint
    expect(model?.constraints.length).toBeGreaterThanOrEqual(1)
  })
})

describe('parser / constraint Value position rejects bare identifiers', () => {
  // Mirrors PICT's actual rule: PICT rejects bare values in constraints
  // with `Incorrect numeric value`. Catching it at parse time keeps the
  // DSL a true subset of PICT (ADR-001) and surfaces the problem with
  // editor-position information instead of a runtime error.

  it('rejects a bare identifier as the RHS of an equality', () => {
    const src = 'F: a, b\nG: g1, g2\nIF [F] = a THEN [G] = "g1";\n'
    const { diagnostics } = parse(src)
    const d = diagnostics.find(x => x.kind === 'syntax' && x.message.includes('"a"'))
    expect(d).toBeDefined()
    expect(d?.message).toContain('quoted')
  })

  it('rejects a bare identifier as the RHS of a THEN equality', () => {
    const src = 'F: a, b\nG: g1, g2\nIF [F] = "a" THEN [G] = g1;\n'
    const { diagnostics } = parse(src)
    expect(diagnostics.some(d => d.kind === 'syntax' && d.message.includes('"g1"'))).toBe(true)
  })

  it('rejects a bare identifier inside an IN clause', () => {
    const src = 'F: a, b, c\n[F] IN { a, "b" };\n'
    const { diagnostics } = parse(src)
    expect(diagnostics.some(d => d.kind === 'syntax' && d.message.includes('"a"'))).toBe(true)
  })

  it('still accepts quoted strings and bare numbers (per PICT rule)', () => {
    const src =
      'F: 1, 2, 3\nG: g1, g2\n' +
      'IF [F] = 1 THEN [G] = "g1";\n' +
      'IF [G] = "g2" THEN [F] = 2;\n'
    const { diagnostics, model } = parse(src)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
    expect(model?.constraints).toHaveLength(2)
  })

  it('still accepts parameter-to-parameter comparison ([A] = [B])', () => {
    const src = 'A: 1, 2\nB: 1, 2\nIF [A] = [B] THEN [A] = 1;\n'
    const { diagnostics, model } = parse(src)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
    expect(model?.constraints).toHaveLength(1)
  })

  it('does not affect Level positions in parameter declarations', () => {
    // The Level rule (parameter declarations) still allows bare identifiers
    // — that is the conventional PICT-compatible form.
    const src = 'OS: Linux, Windows, macOS\nIF [OS] = "Linux" THEN [OS] <> "Windows";\n'
    const { diagnostics } = parse(src)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })
})
