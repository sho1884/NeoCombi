import { useProjectStore } from '../stores/projectStore'
import type { BottomPaneTab } from '../types/project'
import { DslEditor } from './DslEditor'
import { FactorLevelTable } from './FactorLevelTable'
import './BottomPane.css'

const TABS: Array<{ id: BottomPaneTab; label: string }> = [
  { id: 'factors', label: 'Factors & Levels' },
  { id: 'dsl', label: 'DSL' },
  { id: 'testcases', label: 'Test cases' },
]

export function BottomPane() {
  const tab = useProjectStore(s => s.view.bottomPaneTab)
  const setTab = useProjectStore(s => s.setBottomPaneTab)

  return (
    <section className="bottom-pane" aria-label="Bottom pane: authoring">
      <div className="bottom-pane__tabs" role="tablist">
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              className={
                'bottom-pane__tab' +
                (active ? ' bottom-pane__tab--active' : '')
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="bottom-pane__content">
        {tab === 'factors' && <FactorLevelTable />}
        {tab === 'dsl' && <DslEditor />}
        {tab === 'testcases' && (
          <div className="bottom-pane__placeholder">
            Test cases tab is empty until PICT integration lands (SR-050..063).
          </div>
        )}
      </div>
    </section>
  )
}
