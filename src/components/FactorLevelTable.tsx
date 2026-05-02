import { useProjectStore } from '../stores/projectStore'
import './FactorLevelTable.css'

export function FactorLevelTable() {
  const model = useProjectStore(s => s.parseResult.model)
  const factorVisibility = useProjectStore(s => s.view.factorVisibility)
  const setFactorVisibility = useProjectStore(s => s.setFactorVisibility)

  const factors = model?.parameters ?? []

  if (factors.length === 0) {
    return (
      <div className="factor-level-table__empty">
        No factors declared yet. Switch to the DSL tab and write parameter
        declarations like:
        <pre className="factor-level-table__example">
{`OS:      Linux, Windows, macOS
Browser: Chrome, Firefox, Safari`}
        </pre>
        Inline editing of factors and levels here is coming next (SR-010..012).
      </div>
    )
  }

  return (
    <div className="factor-level-table">
      <table className="factor-level-table__table">
        <thead>
          <tr>
            <th className="factor-level-table__col-show" scope="col">Show</th>
            <th className="factor-level-table__col-name" scope="col">Factor</th>
            <th className="factor-level-table__col-count" scope="col">#</th>
            <th className="factor-level-table__col-levels" scope="col">Levels</th>
          </tr>
        </thead>
        <tbody>
          {factors.map(p => {
            const visible = factorVisibility[p.name] !== false
            return (
              <tr key={p.name}>
                <td className="factor-level-table__col-show">
                  <input
                    type="checkbox"
                    aria-label={`Show factor ${p.name} in the matrix`}
                    checked={visible}
                    onChange={e => setFactorVisibility(p.name, e.target.checked)}
                  />
                </td>
                <td className="factor-level-table__col-name">
                  <span className="factor-level-table__name">{p.name}</span>
                </td>
                <td className="factor-level-table__col-count">
                  {p.levels.length}
                </td>
                <td className="factor-level-table__col-levels">
                  <div className="factor-level-table__levels">
                    {p.levels.map(lv => (
                      <span
                        key={`${p.name}::${String(lv.value)}`}
                        className={
                          'factor-level-table__level factor-level-table__level--' +
                          lv.type
                        }
                      >
                        {String(lv.value)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="factor-level-table__hint">
        Edit factors / levels in the DSL tab for now. Inline editing arrives
        with SR-010..012.
      </p>
    </div>
  )
}
