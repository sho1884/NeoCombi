// Hosted-demo plumbing.
//
// On the Vercel deployment there is no PICT service to call, so we
// pre-generate a 50-factor sample model + matching PICT output at
// build time and ship it as a static asset under /demo/demo.json.
// At app startup we auto-load that bundle so a first-time visitor
// immediately sees a populated coverage matrix, forbidden view, and
// test-case grid instead of an empty editor.

const DEMO_BUNDLE_URL = '/demo/demo.json'

/**
 * `true` when the page is running on something other than the local
 * development host. Used to gate the hosted-demo banner and the
 * auto-load below — we don't want to monkey with the user's working
 * state during local development.
 */
export function isHostedDeployment(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  if (!h) return false
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false
  if (h.endsWith('.local')) return false
  return true
}

/**
 * `true` when a real PICT service URL is baked into the build
 * (VITE_PICT_API_URL pointing somewhere other than localhost). When set, the
 * hosted page can run live pairwise generation, so it is no longer a
 * frozen-pairwise demo — only the preloaded sample is "demo".
 */
export function isPictApiConfigured(): boolean {
  const raw = import.meta.env['VITE_PICT_API_URL'] as string | undefined
  if (!raw) return false
  return !/localhost|127\.0\.0\.1|\[::1\]/.test(raw)
}

export type DemoBundle = {
  source: string
  testSuite: {
    factorOrder: string[]
    rows: Array<{ values: Record<string, string>; expected?: string }>
  }
}

/**
 * Fetch the prebuilt demo bundle. Returns null on any failure (network,
 * 404, JSON parse) — the caller should fall back to the empty state.
 */
export async function fetchDemoBundle(): Promise<DemoBundle | null> {
  try {
    const res = await fetch(DEMO_BUNDLE_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    const bundle = (await res.json()) as DemoBundle
    if (!bundle || typeof bundle.source !== 'string') return null
    if (!bundle.testSuite || !Array.isArray(bundle.testSuite.rows)) return null
    return bundle
  } catch {
    return null
  }
}
