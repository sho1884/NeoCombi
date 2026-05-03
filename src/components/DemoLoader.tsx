import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { fetchDemoBundle, isHostedDeployment } from '../services/demoMode'

/**
 * On first mount of a hosted deployment whose store is still in its
 * pristine empty state, fetch and apply the prebuilt demo bundle so
 * visitors land on a populated UI instead of an empty editor.
 *
 * Local dev (and any session that already has source / a test suite)
 * is left alone.
 */
export function DemoLoader() {
  const loadFromTmodel = useProjectStore(s => s.loadFromTmodel)
  const setTestSuite = useProjectStore(s => s.setTestSuite)

  useEffect(() => {
    if (!isHostedDeployment()) return
    const state = useProjectStore.getState()
    if (state.source !== '' || state.testSuite !== null) return
    if (state.filePath !== null) return
    let cancelled = false
    void (async () => {
      const bundle = await fetchDemoBundle()
      if (cancelled || !bundle) return
      // Re-check that the user hasn't started editing while the fetch
      // was in flight — clobbering their work would be unkind.
      const fresh = useProjectStore.getState()
      if (fresh.source !== '' || fresh.testSuite !== null) return
      loadFromTmodel(bundle.source)
      setTestSuite(bundle.testSuite)
    })()
    return () => {
      cancelled = true
    }
  }, [loadFromTmodel, setTestSuite])

  return null
}
