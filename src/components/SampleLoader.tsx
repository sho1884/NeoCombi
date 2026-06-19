import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'

/**
 * Deep-link loader. When the page is opened with `?file=<url>`, fetch that
 * `.tmodel` and load it into a pristine project. This is how sample models are
 * shared — they live outside the app bundle (e.g. on GitHub Pages) and are
 * pulled in on demand, matching NeoCEG's `?file=` convention.
 *
 * Only loads into an untouched store; never clobbers in-progress work.
 */
export function SampleLoader() {
  const loadFromTmodel = useProjectStore(s => s.loadFromTmodel)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const fileUrl = new URLSearchParams(window.location.search).get('file')
    if (!fileUrl) return

    const state = useProjectStore.getState()
    if (state.source !== '' || state.testSuite !== null || state.filePath !== null) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(fileUrl, { cache: 'no-cache' })
        if (cancelled || !res.ok) return
        const text = await res.text()
        if (cancelled) return
        // Re-check the store wasn't touched while the fetch was in flight.
        const fresh = useProjectStore.getState()
        if (fresh.source !== '' || fresh.testSuite !== null || fresh.filePath !== null) return
        loadFromTmodel(text)
      } catch {
        // Bad URL / network / CORS — leave the empty editor as-is.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadFromTmodel])

  return null
}
