// Deployment / runtime detection for the hosted build.
//
// The app bundles no demo data. Sample models live outside the app and are
// loaded on demand via a `?file=<url>` query parameter (see SampleLoader),
// the same convention NeoCEG uses.

/**
 * `true` when the page is running on something other than the local
 * development host. Used to gate the hosted banner — we don't want to show
 * demo messaging during local development.
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
 * hosted page can run live pairwise generation.
 */
export function isPictApiConfigured(): boolean {
  const raw = import.meta.env['VITE_PICT_API_URL'] as string | undefined
  if (!raw) return false
  return !/localhost|127\.0\.0\.1|\[::1\]/.test(raw)
}
