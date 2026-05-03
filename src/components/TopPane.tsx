import { useProjectStore } from '../stores/projectStore'
import type { TopPaneTab } from '../types/project'
import { ExhaustiveMatrix } from './ExhaustiveMatrix'
import { ForbiddenView } from './ForbiddenView'
import './TopPane.css'

const TOP_TABS: Array<{ id: TopPaneTab; label: string; description: string }> = [
  { id: 'coverage', label: 'Coverage', description: 'Exhaustive cross-tabulation matrix (SR-040..043)' },
  { id: 'forbidden', label: 'Forbidden', description: 'DSL-derived forbidden combinations (SR-030..033)' },
]

export function TopPane() {
  const tab = useProjectStore(s => s.view.topPaneTab)
  const setTab = useProjectStore(s => s.setTopPaneTab)

  return (
    <section className="top-pane" aria-label="Top pane: visualization">
      <div className="top-pane__tabs" role="tablist">
        {TOP_TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={t.description}
              title={t.description}
              className={
                'top-pane__tab' + (active ? ' top-pane__tab--active' : '')
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="top-pane__content">
        {tab === 'coverage' ? <ExhaustiveMatrix /> : <ForbiddenView />}
      </div>
    </section>
  )
}
