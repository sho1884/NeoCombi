import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPictApiHealth, generateTestCases } from '../../src/services/pictApi'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A fetch that never answers, but rejects (like the platform) when aborted. */
function hangingFetch(): typeof fetch {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      }
    })
  }) as unknown as typeof fetch
}

describe('checkPictApiHealth', () => {
  it('reports a network error (not a hang) when the service accepts the connection but never responds', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const result = await checkPictApiHealth('https://example.test', { timeoutMs: 20 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(result.error.message).toMatch(/no response within/i)
    }
  })

  it('returns the parsed health JSON on a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: true, available: true, version: '3.7', path: '/usr/bin/pict' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const result = await checkPictApiHealth('https://example.test')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.available).toBe(true)
  })
})

describe('generateTestCases', () => {
  it('reports a timeout network error instead of hanging forever on a wedged service', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const result = await generateTestCases('P: a, b\n', { timeoutMs: 20 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(result.error.message).toMatch(/no response within/i)
    }
  })
})
