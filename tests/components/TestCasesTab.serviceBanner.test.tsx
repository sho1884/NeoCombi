/**
 * Verifies that the Test cases tab makes the PICT service's reachability
 * visible instead of failing silently. Each failure mode is simulated by
 * stubbing fetch; we assert the matching banner renders.
 *
 * Background: on localhost happy-dom, isHostedDeployment() is false, so in
 * pairwise mode the tab probes the service (expectsService === true).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { TestCasesTab } from '../../src/components/TestCasesTab'
import { useProjectStore } from '../../src/stores/projectStore'

beforeEach(() => {
  useProjectStore.getState().resetToEmpty()
  useProjectStore.getState().setGenerationMode('pairwise')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A 200 /health response with the given availability. */
function healthOk(available: boolean): typeof fetch {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({ ok: true, available, version: '3.7', path: '/usr/bin/pict' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  ) as unknown as typeof fetch
}

describe('TestCasesTab — PICT service reachability', () => {
  it('shows the "Can\'t reach" banner with a Retry button when the probe fails', async () => {
    // Reject immediately: both staged probe attempts fail fast → unreachable.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await act(async () => {
      render(<TestCasesTab />)
    })
    await waitFor(() =>
      expect(screen.getByText(/Can't reach the PICT service/i)).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy()
  })

  it('shows the "PICT isn\'t available" banner when the service is up but PICT is missing', async () => {
    vi.stubGlobal('fetch', healthOk(false))
    await act(async () => {
      render(<TestCasesTab />)
    })
    await waitFor(() =>
      expect(screen.getByText(/PICT isn't available on it/i)).toBeTruthy(),
    )
  })

  it('shows no service banner when the service is reachable and PICT is available', async () => {
    vi.stubGlobal('fetch', healthOk(true))
    await act(async () => {
      render(<TestCasesTab />)
    })
    // Let the probe resolve, then assert the down/missing banners are absent.
    await waitFor(() =>
      expect(useProjectStore.getState().generationMode).toBe('pairwise'),
    )
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText(/Can't reach the PICT service/i)).toBeNull()
    expect(screen.queryByText(/PICT isn't available on it/i)).toBeNull()
  })
})
