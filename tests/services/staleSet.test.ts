import { describe, it, expect } from 'vitest'
import { inspectTestSuite } from '../../src/services/staleSet'
import { parse } from '../../src/engines/dsl'
import type { TestSuite } from '../../src/types/testCase'

function model(src: string) {
  return parse(src).model
}

const SUITE: TestSuite = {
  factorOrder: ['OS', 'Browser'],
  rows: [
    { id: 'P1', count: true, values: { OS: 'Linux', Browser: 'Chrome' } },
    { id: 'P2', count: true, values: { OS: 'Windows', Browser: 'Safari' } },
  ],
}

describe('inspectTestSuite', () => {
  it('is not stale when every factor and value still exists', () => {
    const m = model('OS: Linux, Windows\nBrowser: Chrome, Safari\n')
    expect(inspectTestSuite(SUITE, m).stale).toBe(false)
  })

  it('flags a factor that was renamed away / removed in raw DSL text', () => {
    const m = model('Platform: Linux, Windows\nBrowser: Chrome, Safari\n')
    const info = inspectTestSuite(SUITE, m)
    expect(info.stale).toBe(true)
    expect(info.missingFactors).toEqual(['OS'])
  })

  it('flags a row value no longer among the declared levels', () => {
    const m = model('OS: Ubuntu, Windows\nBrowser: Chrome, Safari\n')
    const info = inspectTestSuite(SUITE, m)
    expect(info.stale).toBe(true)
    expect(info.hasInvalidValues).toBe(true)
  })

  it('is not stale for a null suite or model', () => {
    expect(inspectTestSuite(null, model('OS: Linux\n')).stale).toBe(false)
    expect(inspectTestSuite(SUITE, null).stale).toBe(false)
  })

  it('ignores forbidden decision-table rows values that are still declared', () => {
    const m = model('Color: Red, Blue\nSize: S, L\n')
    const suite: TestSuite = {
      factorOrder: ['Color', 'Size'],
      rows: [
        { id: 'D1', count: true, values: { Color: 'Red', Size: 'S' }, forbidden: false },
        { values: { Color: 'Red', Size: 'L' }, forbidden: true },
      ],
    }
    expect(inspectTestSuite(suite, m).stale).toBe(false)
  })
})
