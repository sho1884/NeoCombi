import { useMemo } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { computeForbiddenSlice } from '../engines/dsl'
import type { Model, ParameterDecl } from '../types/dsl'
import type { TestSuite } from '../types/testCase'
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
  const testSuite = useProjectStore(s => s.testSuite)

  const visibleFactors = useMemo<ParameterDecl[]>(() => {
    const params = model?.parameters ?? []
    return params.filter(p => factorVisibility[p.name] !== false)
  }, [model, factorVisibility])

  const occurrenceMap = useMemo(
    () => buildOccurrenceMap(testSuite),
    [testSuite],
  )

  const forbiddenMap = useMemo(
    () => buildForbiddenMap(model, visibleFactors),
    [model, visibleFactors],
  )

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

  const stats = computeStats(visibleFactors, occurrenceMap, forbiddenMap)
  const hasTestSuite = testSuite !== null

  return (
    <div className="matrix">
      {!hasTestSuite && (
        <div className="matrix__no-suite-banner" role="status">
          <strong>No test cases imported.</strong> Cells show only the pair
          structure and DSL-derived forbidden marks (
          <span className="matrix__no-suite-banner-marker">✗</span>). Import
          a CSV in the <strong>Test cases</strong> tab to populate occurrence
          counts.
        </div>
      )}
      <CoverageSummary stats={stats} hasTestSuite={hasTestSuite} />
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
                    if (sameFactor) {
                      return (
                        <td
                          key={`cell-${colFactor.name}::${String(colLevel.value)}`}
                          className="matrix__cell matrix__cell--blocked"
                          aria-label="same factor (blocked)"
                        />
                      )
                    }
                    const occ = occurrenceMap
                      ? occurrenceCount(
                          occurrenceMap,
                          rowFactor.name,
                          String(rowLevel.value),
                          colFactor.name,
                          String(colLevel.value),
                        )
                      : null
                    const forbidden = forbiddenMap
                      ? isForbidden(
                          forbiddenMap,
                          rowFactor.name,
                          String(rowLevel.value),
                          colFactor.name,
                          String(colLevel.value),
                        )
                      : false
                    let display: string
                    let cellClass = 'matrix__cell matrix__cell--pair'
                    if (forbidden) {
                      display = '✗'
                      cellClass += ' matrix__cell--forbidden'
                    } else if (occ === null) {
                      display = '·'
                      cellClass += ' matrix__cell--placeholder'
                    } else if (occ === 0) {
                      display = '?'
                      cellClass += ' matrix__cell--missed'
                    } else {
                      display = String(occ)
                      cellClass += ' matrix__cell--covered'
                    }
                    return (
                      <td
                        key={`cell-${colFactor.name}::${String(colLevel.value)}`}
                        className={cellClass}
                        aria-label={
                          cellLabel +
                          (occ === null ? '' : `, occurrences: ${occ}`)
                        }
                      >
                        <span className="matrix__cell-content">{display}</span>
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

// =============================================================================
// Coverage summary band: legend + counts so users can read the colors and
// see at a glance how much of the pair space is covered (SR-040 / SR-042 /
// SR-043). Without an imported test suite the summary still shows total
// pair count and forbidden count derived from the DSL alone.
// =============================================================================

type Stats = {
  totalPairs: number
  forbiddenPairs: number
  coveredPairs: number
  missedPairs: number
  /** covered / (total - forbidden); null when denominator is 0 */
  coverageRate: number | null
}

function computeStats(
  visibleFactors: ParameterDecl[],
  occurrenceMap: OccurrenceMap | null,
  forbiddenMap: ForbiddenMap | null,
): Stats {
  let total = 0
  let forbidden = 0
  let covered = 0
  for (let i = 0; i < visibleFactors.length; i++) {
    for (let j = i + 1; j < visibleFactors.length; j++) {
      const a = visibleFactors[i]!
      const b = visibleFactors[j]!
      for (const al of a.levels) {
        for (const bl of b.levels) {
          total++
          const va = String(al.value)
          const vb = String(bl.value)
          const isF = forbiddenMap
            ? isForbidden(forbiddenMap, a.name, va, b.name, vb)
            : false
          if (isF) {
            forbidden++
            continue
          }
          if (occurrenceMap) {
            const occ = occurrenceCount(occurrenceMap, a.name, va, b.name, vb)
            if (occ > 0) covered++
          }
        }
      }
    }
  }
  const missed = Math.max(0, total - forbidden - covered)
  const denom = total - forbidden
  const rate = denom > 0 ? covered / denom : null
  return {
    totalPairs: total,
    forbiddenPairs: forbidden,
    coveredPairs: covered,
    missedPairs: missed,
    coverageRate: rate,
  }
}

type CoverageSummaryProps = {
  stats: Stats
  hasTestSuite: boolean
}

function CoverageSummary({ stats, hasTestSuite }: CoverageSummaryProps) {
  const ratePct = stats.coverageRate === null
    ? null
    : Math.round(stats.coverageRate * 1000) / 10
  return (
    <div className="matrix__summary" role="status">
      <span className="matrix__legend matrix__legend--covered">
        <span className="matrix__legend-swatch" /> covered: {hasTestSuite ? stats.coveredPairs : '—'}
      </span>
      <span className="matrix__legend matrix__legend--missed">
        <span className="matrix__legend-swatch" /> missed: {hasTestSuite ? stats.missedPairs : '—'}
      </span>
      <span className="matrix__legend matrix__legend--forbidden">
        <span className="matrix__legend-swatch" /> forbidden: {stats.forbiddenPairs}
      </span>
      <span className="matrix__summary-total">
        total pairs: {stats.totalPairs}
      </span>
      {hasTestSuite && ratePct !== null && (
        <span className="matrix__summary-rate">
          coverage: {ratePct}%
        </span>
      )}
      {!hasTestSuite && (
        <span className="matrix__summary-hint">
          Import test cases to populate the coverage / missed columns.
        </span>
      )}
    </div>
  )
}

// =============================================================================
// Occurrence map: count how many test cases include each (factor, level) pair
// of distinct factors. Returns null when there is no test suite, so the
// matrix can render placeholder cells.
// =============================================================================

type OccurrenceMap = Map<string, number>

function buildOccurrenceMap(suite: TestSuite | null): OccurrenceMap | null {
  if (!suite || suite.rows.length === 0) return null
  const map: OccurrenceMap = new Map()
  for (const row of suite.rows) {
    const factors = suite.factorOrder
    for (let i = 0; i < factors.length; i++) {
      for (let j = 0; j < factors.length; j++) {
        if (i === j) continue
        const fa = factors[i]!
        const fb = factors[j]!
        const va = row.values[fa]
        const vb = row.values[fb]
        if (va === undefined || vb === undefined) continue
        const key = pairKey(fa, va, fb, vb)
        map.set(key, (map.get(key) ?? 0) + 1)
      }
    }
  }
  return map
}

function pairKey(fa: string, va: string, fb: string, vb: string): string {
  return `${fa}${va}${fb}${vb}`
}

function occurrenceCount(
  map: OccurrenceMap,
  rowFactor: string,
  rowLevel: string,
  colFactor: string,
  colLevel: string,
): number {
  return map.get(pairKey(rowFactor, rowLevel, colFactor, colLevel)) ?? 0
}

// =============================================================================
// Forbidden map: for each unordered factor pair (i, j) in the visible factor
// set, run the evaluator and record which level pairs are forbidden by the
// DSL. Returns null when there are too few visible factors or when any per-
// pair evaluation hits the size guard (the matrix simply omits the forbidden
// shading in that case).
// =============================================================================

const SEP = ' '
type ForbiddenMap = Map<string, Set<string>>

function buildForbiddenMap(
  model: Model | null,
  visibleFactors: ParameterDecl[],
): ForbiddenMap | null {
  if (!model || visibleFactors.length < 2) return null
  const map: ForbiddenMap = new Map()
  for (let i = 0; i < visibleFactors.length; i++) {
    for (let j = i + 1; j < visibleFactors.length; j++) {
      const a = visibleFactors[i]!
      const b = visibleFactors[j]!
      const result = computeForbiddenSlice(model, [a.name, b.name])
      if (!result.ok) return null
      const forwardSet = new Set<string>()
      const reverseSet = new Set<string>()
      for (const cell of result.value.cells) {
        if (!cell.forbidden) continue
        const va = String(cell.assignment[a.name])
        const vb = String(cell.assignment[b.name])
        forwardSet.add(va + SEP + vb)
        reverseSet.add(vb + SEP + va)
      }
      map.set(a.name + SEP + b.name, forwardSet)
      map.set(b.name + SEP + a.name, reverseSet)
    }
  }
  return map
}

function isForbidden(
  map: ForbiddenMap,
  rowFactor: string,
  rowLevel: string,
  colFactor: string,
  colLevel: string,
): boolean {
  const set = map.get(rowFactor + SEP + colFactor)
  if (!set) return false
  return set.has(rowLevel + SEP + colLevel)
}
