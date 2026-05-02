import { useMemo } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { ParameterDecl } from '../types/dsl'
import './ExhaustiveMatrix.css'

export function ExhaustiveMatrix() {
  const model = useProjectStore(s => s.parseResult.model)
  const factorVisibility = useProjectStore(s => s.view.factorVisibility)

  const visibleFactors = useMemo<ParameterDecl[]>(() => {
    const params = model?.parameters ?? []
    return params.filter(p => factorVisibility[p.name] !== false)
  }, [model, factorVisibility])

  if (visibleFactors.length === 0) {
    return (
      <div className="matrix__empty">
        Declare factors in the DSL editor or Factors &amp; Levels tab to populate the
        cross-tabulation matrix here. Use the checkboxes above to hide factors
        from this view (SR-041).
      </div>
    )
  }

  if (visibleFactors.length === 1) {
    return (
      <div className="matrix__empty">
        Only one factor is visible — pair coverage requires at least two
        factors. Add another factor (or check more boxes above) to see the
        cross-tabulation matrix.
      </div>
    )
  }

  // Generate ordered factor pairs (i &lt; j) once.
  const pairs: Array<[ParameterDecl, ParameterDecl]> = []
  for (let i = 0; i < visibleFactors.length; i++) {
    for (let j = i + 1; j < visibleFactors.length; j++) {
      pairs.push([visibleFactors[i]!, visibleFactors[j]!])
    }
  }

  return (
    <div className="matrix">
      {pairs.map(([row, col]) => (
        <PairGrid key={`${row.name}::${col.name}`} row={row} col={col} />
      ))}
    </div>
  )
}

type PairGridProps = {
  row: ParameterDecl
  col: ParameterDecl
}

function PairGrid({ row, col }: PairGridProps) {
  return (
    <div className="pair-grid">
      <div className="pair-grid__caption">
        <span className="pair-grid__factor pair-grid__factor--row">{row.name}</span>
        <span className="pair-grid__caption-sep">×</span>
        <span className="pair-grid__factor pair-grid__factor--col">{col.name}</span>
      </div>
      <table className="pair-grid__table" role="grid">
        <thead>
          <tr>
            <th aria-label={`${row.name} levels (rows) × ${col.name} levels (columns)`} />
            {col.levels.map(lv => (
              <th key={String(lv.value)} scope="col">
                {String(lv.value)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.levels.map(rl => (
            <tr key={String(rl.value)}>
              <th scope="row">{String(rl.value)}</th>
              {col.levels.map(cl => (
                <td
                  key={String(cl.value)}
                  className="pair-grid__cell"
                  aria-label={`${row.name}=${String(rl.value)}, ${col.name}=${String(cl.value)}`}
                >
                  <span className="pair-grid__cell-placeholder">·</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
