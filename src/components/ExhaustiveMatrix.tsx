import { useMemo } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { ParameterDecl } from '../types/dsl'
import './ExhaustiveMatrix.css'

/**
 * Single cross-tabulation matrix in the PICT-PAPP "総当たり表" style:
 * one large square table whose rows and columns are every (factor, level)
 * pair across the visible factors. Diagonal blocks (same factor on both
 * axes) are blocked. Off-diagonal cells are the level-pair intersections.
 */
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
        Declare factors in the DSL editor or Factors &amp; Levels tab to populate
        the exhaustive cross-tabulation matrix here. Use the checkboxes above to
        hide factors from this view (SR-041).
      </div>
    )
  }

  if (visibleFactors.length === 1) {
    return (
      <div className="matrix__empty">
        Only one factor is visible — pair coverage requires at least two
        factors. Check more boxes above (or add factors) to see the
        cross-tabulation matrix.
      </div>
    )
  }

  return (
    <div className="matrix">
      <table className="matrix__table" role="grid">
        <thead>
          <tr>
            <th className="matrix__corner" colSpan={2} aria-hidden="true" />
            {visibleFactors.map(f => (
              <th
                key={`col-factor-${f.name}`}
                className="matrix__factor-header matrix__factor-header--col"
                colSpan={Math.max(f.levels.length, 1)}
                scope="colgroup"
              >
                {f.name}
              </th>
            ))}
          </tr>
          <tr>
            <th className="matrix__corner" colSpan={2} aria-hidden="true" />
            {visibleFactors.flatMap(f =>
              f.levels.map(lv => (
                <th
                  key={`col-level-${f.name}::${String(lv.value)}`}
                  className="matrix__level-header matrix__level-header--col"
                  scope="col"
                >
                  {String(lv.value)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {visibleFactors.flatMap(rowFactor =>
            rowFactor.levels.map((rowLevel, rowLevelIdx) => (
              <tr key={`row-${rowFactor.name}::${String(rowLevel.value)}`}>
                {rowLevelIdx === 0 && (
                  <th
                    className="matrix__factor-header matrix__factor-header--row"
                    rowSpan={rowFactor.levels.length}
                    scope="rowgroup"
                  >
                    {rowFactor.name}
                  </th>
                )}
                <th
                  className="matrix__level-header matrix__level-header--row"
                  scope="row"
                >
                  {String(rowLevel.value)}
                </th>
                {visibleFactors.flatMap(colFactor =>
                  colFactor.levels.map(colLevel => {
                    const sameFactor = rowFactor.name === colFactor.name
                    const cellLabel =
                      `${rowFactor.name}=${String(rowLevel.value)}, ` +
                      `${colFactor.name}=${String(colLevel.value)}`
                    return (
                      <td
                        key={`cell-${colFactor.name}::${String(colLevel.value)}`}
                        className={
                          'matrix__cell ' +
                          (sameFactor
                            ? 'matrix__cell--blocked'
                            : 'matrix__cell--pair')
                        }
                        aria-label={sameFactor ? 'same factor (blocked)' : cellLabel}
                      >
                        {sameFactor ? '' : <span className="matrix__cell-placeholder">·</span>}
                      </td>
                    )
                  }),
                )}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  )
}
