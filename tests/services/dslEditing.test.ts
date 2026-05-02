import { describe, it, expect } from 'vitest'
import {
  addFactor,
  addLevelToFactor,
  moveFactor,
  moveLevel,
  removeFactor,
  removeLevelFromFactor,
  renameFactor,
  renameLevel,
} from '../../src/services/dslEditing'
import { parse } from '../../src/engines/dsl'

describe('dslEditing / renameFactor', () => {
  it('renames the factor declaration and propagates to [refs] in constraints', () => {
    const src = [
      'OS: Linux, Windows',
      'Browser: Chrome, Safari',
      'IF [OS] = "Linux" THEN [Browser] <> "Safari";',
      '',
    ].join('\n')
    const next = renameFactor(src, 'OS', 'Operating System')
    expect(next).toContain('Operating System: Linux, Windows')
    expect(next).toContain('IF [Operating System] = "Linux"')
    expect(next).not.toContain('[OS]')
    // Parses cleanly after rename.
    expect(parse(next).diagnostics).toEqual([])
  })

  it('renames only the targeted factor and leaves others intact', () => {
    const src = 'OS: Linux\nOSVersion: 11, 12\nIF [OS] = "Linux" THEN [OSVersion] = 11;\n'
    const next = renameFactor(src, 'OS', 'OperatingSystem')
    expect(next).toContain('OperatingSystem: Linux')
    expect(next).toContain('OSVersion: 11, 12')
    expect(next).toContain('[OperatingSystem]')
    expect(next).toContain('[OSVersion]')
  })

  it('returns source unchanged when oldName equals newName', () => {
    const src = 'OS: Linux\n'
    expect(renameFactor(src, 'OS', 'OS')).toBe(src)
  })

  it('returns source unchanged when factor does not exist', () => {
    const src = 'OS: Linux\n'
    expect(renameFactor(src, 'Browser', 'Edge')).toBe(src)
  })

  it('does not mutate the comment text that mentions the factor name', () => {
    const src = '# OS factor below\nOS: Linux\n'
    const next = renameFactor(src, 'OS', 'OperatingSystem')
    expect(next).toContain('# OS factor below')
    expect(next).toContain('OperatingSystem: Linux')
  })
})

describe('dslEditing / addFactor', () => {
  it('appends a new factor after the last existing one', () => {
    const src = 'OS: Linux\n'
    const next = addFactor(src, 'Browser', ['Chrome', 'Safari'])
    expect(next).toBe('OS: Linux\nBrowser: Chrome, Safari\n')
  })

  it('prepends when the source has no parameters yet', () => {
    const src = ''
    const next = addFactor(src, 'OS', ['Linux', 'Windows'])
    expect(next).toBe('OS: Linux, Windows\n')
  })

  it('uses default placeholder levels when not supplied', () => {
    const next = addFactor('', 'NewFactor')
    expect(next).toContain('NewFactor: Level1, Level2')
  })

  it('inserts before existing constraints', () => {
    const src = 'OS: Linux\nIF [OS] = "Linux" THEN [OS] = "Linux";\n'
    const next = addFactor(src, 'Browser', ['Chrome'])
    const lines = next.split('\n')
    const osIdx = lines.findIndex(l => l.startsWith('OS:'))
    const brIdx = lines.findIndex(l => l.startsWith('Browser:'))
    const ifIdx = lines.findIndex(l => l.startsWith('IF '))
    expect(osIdx).toBeLessThan(brIdx)
    expect(brIdx).toBeLessThan(ifIdx)
  })
})

describe('dslEditing / removeFactor', () => {
  it('removes the factor declaration line', () => {
    const src = 'OS: Linux, Windows\nBrowser: Chrome, Safari\n'
    const next = removeFactor(src, 'OS')
    expect(next).toBe('Browser: Chrome, Safari\n')
  })

  it('removes a final-line factor without leaving a dangling blank line', () => {
    const src = 'OS: Linux\nBrowser: Chrome'
    // Input has no trailing newline, so the result preserves that exact
    // shape — the previous newline is the separator that gets consumed
    // along with the removed line.
    expect(removeFactor(src, 'Browser')).toBe('OS: Linux')
  })

  it('returns source unchanged when factor does not exist', () => {
    const src = 'OS: Linux\n'
    expect(removeFactor(src, 'Browser')).toBe(src)
  })
})

describe('dslEditing / addLevelToFactor', () => {
  it('appends a level to the factor list', () => {
    const src = 'OS: Linux, Windows\n'
    const next = addLevelToFactor(src, 'OS', 'macOS')
    expect(next).toContain('OS: Linux, Windows, macOS')
  })

  it('returns source unchanged when factor does not exist', () => {
    const src = 'OS: Linux\n'
    expect(addLevelToFactor(src, 'Bogus', 'X')).toBe(src)
  })
})

describe('dslEditing / removeLevelFromFactor', () => {
  it('removes a middle level along with its preceding comma', () => {
    const src = 'OS: Linux, Windows, macOS\n'
    const next = removeLevelFromFactor(src, 'OS', 'Windows')
    expect(parse(next).model?.parameters[0]?.levels.map(l => String(l.value)))
      .toEqual(['Linux', 'macOS'])
  })

  it('removes the first level along with its following comma', () => {
    const src = 'OS: Linux, Windows, macOS\n'
    const next = removeLevelFromFactor(src, 'OS', 'Linux')
    expect(parse(next).model?.parameters[0]?.levels.map(l => String(l.value)))
      .toEqual(['Windows', 'macOS'])
  })

  it('removes the last level along with its preceding comma', () => {
    const src = 'OS: Linux, Windows, macOS\n'
    const next = removeLevelFromFactor(src, 'OS', 'macOS')
    expect(parse(next).model?.parameters[0]?.levels.map(l => String(l.value)))
      .toEqual(['Linux', 'Windows'])
  })

  it('refuses to empty the level list', () => {
    const src = 'OS: Linux\n'
    expect(removeLevelFromFactor(src, 'OS', 'Linux')).toBe(src)
  })
})

describe('dslEditing / renameLevel', () => {
  it('renames the level in the declaration', () => {
    const src = 'OS: Linux, Windows\n'
    const next = renameLevel(src, 'OS', 'Linux', 'Ubuntu')
    expect(next).toContain('OS: Ubuntu, Windows')
  })

  it('rewrites = "oldValue" references in constraints', () => {
    const src = [
      'OS: Linux, Windows',
      'Browser: Chrome, Safari',
      'IF [OS] = "Linux" THEN [Browser] <> "Safari";',
      '',
    ].join('\n')
    const next = renameLevel(src, 'OS', 'Linux', 'Ubuntu')
    expect(next).toContain('"Ubuntu"')
    expect(next).not.toContain('"Linux"')
    // Other factor's level untouched.
    expect(next).toContain('"Safari"')
  })

  it('rewrites IN { ... } references', () => {
    const src = [
      'OS: Linux, Windows, macOS',
      'Cloud: AWS, Azure',
      'IF [OS] IN { "Linux", "macOS" } THEN [Cloud] = "AWS";',
      '',
    ].join('\n')
    const next = renameLevel(src, 'OS', 'Linux', 'Ubuntu')
    expect(next).toContain('IN { "Ubuntu", "macOS" }')
  })

  it('does not touch matching values that belong to a different factor', () => {
    const src = [
      'A: Linux, Windows',
      'B: Linux, Mac',
      'IF [A] = "Linux" THEN [B] = "Linux";',
      '',
    ].join('\n')
    const next = renameLevel(src, 'A', 'Linux', 'Ubuntu')
    expect(next).toContain('A: Ubuntu, Windows')
    expect(next).toContain('B: Linux, Mac')
    expect(next).toContain('IF [A] = "Ubuntu" THEN [B] = "Linux";')
  })

  it('preserves the original token type (identifier vs string)', () => {
    const src = 'OS: Linux, Windows\nIF [OS] = "Linux" THEN [OS] = "Linux";\n'
    const next = renameLevel(src, 'OS', 'Linux', 'Ubuntu')
    // Declaration uses identifier form, constraint uses string form.
    expect(next).toContain('OS: Ubuntu, Windows')
    expect(next).toContain('"Ubuntu"')
  })

  it('returns source unchanged when oldValue equals newValue', () => {
    const src = 'OS: Linux, Windows\n'
    expect(renameLevel(src, 'OS', 'Linux', 'Linux')).toBe(src)
  })
})

describe('dslEditing / moveFactor', () => {
  it('moves a factor up by swapping with the previous one', () => {
    const src = 'A: 1, 2\nB: x, y\nC: p, q\n'
    const next = moveFactor(src, 'B', 'up')
    const names = parse(next).model?.parameters.map(p => p.name)
    expect(names).toEqual(['B', 'A', 'C'])
  })

  it('moves a factor down by swapping with the next one', () => {
    const src = 'A: 1, 2\nB: x, y\nC: p, q\n'
    const next = moveFactor(src, 'B', 'down')
    const names = parse(next).model?.parameters.map(p => p.name)
    expect(names).toEqual(['A', 'C', 'B'])
  })

  it('does nothing at the boundaries', () => {
    const src = 'A: 1\nB: 2\n'
    expect(moveFactor(src, 'A', 'up')).toBe(src)
    expect(moveFactor(src, 'B', 'down')).toBe(src)
  })

  it('preserves the constraint section after a swap', () => {
    const src = 'A: 1, 2\nB: x, y\nIF [A] = 1 THEN [B] = "x";\n'
    const next = moveFactor(src, 'B', 'up')
    expect(next).toContain('IF [A] = 1 THEN [B] = "x";')
  })
})

describe('dslEditing / moveLevel', () => {
  it('moves a level up within the factor list', () => {
    const src = 'OS: Linux, Windows, macOS\n'
    const next = moveLevel(src, 'OS', 'macOS', 'up')
    expect(parse(next).model?.parameters[0]?.levels.map(l => String(l.value)))
      .toEqual(['Linux', 'macOS', 'Windows'])
  })

  it('moves a level down within the factor list', () => {
    const src = 'OS: Linux, Windows, macOS\n'
    const next = moveLevel(src, 'OS', 'Linux', 'down')
    expect(parse(next).model?.parameters[0]?.levels.map(l => String(l.value)))
      .toEqual(['Windows', 'Linux', 'macOS'])
  })

  it('does nothing at the boundaries', () => {
    const src = 'OS: Linux, Windows\n'
    expect(moveLevel(src, 'OS', 'Linux', 'up')).toBe(src)
    expect(moveLevel(src, 'OS', 'Windows', 'down')).toBe(src)
  })
})
