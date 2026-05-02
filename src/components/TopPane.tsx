import { useProjectStore } from '../stores/projectStore'
import { ExhaustiveMatrix } from './ExhaustiveMatrix'
import './TopPane.css'

export function TopPane() {
  const model = useProjectStore(s => s.parseResult.model)
  const factorVisibility = useProjectStore(s => s.view.factorVisibility)
  const setFactorVisibility = useProjectStore(s => s.setFactorVisibility)

  const factors = model?.parameters ?? []

  return (
    <section className="top-pane" aria-label="Top pane: visualization">
      <div className="top-pane__toolbar">
        <span className="top-pane__toolbar-label">Factors:</span>
        {factors.length === 0 ? (
          <span className="top-pane__toolbar-hint">
            (No factors yet — declare them in the DSL or Factors &amp; Levels tab below.)
          </span>
        ) : (
          factors.map(p => {
            const visible = factorVisibility[p.name] !== false
            return (
              <label key={p.name} className="top-pane__chip">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={e => setFactorVisibility(p.name, e.target.checked)}
                />
                <span>{p.name}</span>
              </label>
            )
          })
        )}
      </div>

      <div className="top-pane__matrix">
        <ExhaustiveMatrix />
      </div>
    </section>
  )
}
