/**
 * Reproduces the user-reported issue that the Factor & Level table
 * fails to reflect changes made in the DSL editor. We render the
 * component, mutate the store via setSource (the same path the DSL
 * editor takes), then assert the component re-renders with the new
 * factors / levels.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { FactorLevelTable } from '../../src/components/FactorLevelTable'
import { useProjectStore } from '../../src/stores/projectStore'

beforeEach(() => {
  useProjectStore.getState().resetToEmpty()
})

afterEach(() => {
  cleanup()
})

describe('FactorLevelTable / reactivity', () => {
  it('renders factors that exist when first mounted', () => {
    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows\n')
    })
    render(<FactorLevelTable />)
    expect(screen.getByDisplayValue('OS')).toBeTruthy()
  })

  it('reflects a new factor added via setSource (DSL edit) after mount', () => {
    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows\n')
    })
    render(<FactorLevelTable />)
    expect(screen.queryByDisplayValue('Browser')).toBeNull()

    act(() => {
      useProjectStore
        .getState()
        .setSource('OS: Linux, Windows\nBrowser: Chrome, Safari\n')
    })
    expect(screen.getByDisplayValue('Browser')).toBeTruthy()
  })

  it('reflects a factor rename made via setSource', () => {
    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows\n')
    })
    render(<FactorLevelTable />)
    expect(screen.getByDisplayValue('OS')).toBeTruthy()

    act(() => {
      useProjectStore.getState().setSource('Operating System: Linux, Windows\n')
    })
    expect(screen.getByDisplayValue('Operating System')).toBeTruthy()
    expect(screen.queryByDisplayValue('OS')).toBeNull()
  })

  it('reflects a level added to a factor via setSource', () => {
    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows\n')
    })
    render(<FactorLevelTable />)
    expect(screen.queryByText('macOS')).toBeNull()

    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows, macOS\n')
    })
    expect(screen.getByText('macOS')).toBeTruthy()
  })

  it('reflects a level rename made via setSource', () => {
    act(() => {
      useProjectStore.getState().setSource('OS: Linux, Windows\n')
    })
    render(<FactorLevelTable />)
    expect(screen.getByText('Linux')).toBeTruthy()

    act(() => {
      useProjectStore.getState().setSource('OS: Ubuntu, Windows\n')
    })
    expect(screen.getByText('Ubuntu')).toBeTruthy()
    expect(screen.queryByText('Linux')).toBeNull()
  })
})
