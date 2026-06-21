import { useMemo, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { computeForbiddenSlice } from '../engines/dsl'
import { inspectTestSuite } from '../services/staleSet'
import { MASK_LEVEL } from '../engines/dsl/maskLevel'
import { FORBIDDEN_MARK } from '../engines/dsl/formatDecisionTable'
import type { Model, ParameterDecl } from '../types/dsl'
import type { TestSuite } from '../types/testCase'
import {
  copyTableToClipboard,
  escapeHtml,
} from '../services/clipboardWrite'
import './ExhaustiveMatrix.css'

/**
 * Single cross-tabulation matrix in the PICT-PAPP all-pairs ("soatari") style:
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

  const stale = useMemo(() => inspectTestSuite(testSuite, model), [testSuite, model])

  const forbiddenMap = useMemo(
    () => buildForbiddenMap(model, visibleFactors),
    [model, visibleFactors],
  )

  if (visibleFactors.length === 0) {
    return (
      <div className="matrix__empty">
        Declare factors in the DSL editor or Factors &amp; Levels tab to
        populate the matrix. Use the <strong>Show</strong> column in the
        Factors &amp; Levels tab to choose which factors appear here.
      </div>
    )
  }

  if (visibleFactors.length === 1) {
    return (
      <div className="matrix__empty">
        Only one factor is visible — pair coverage needs at least two.
        Check more rows in the <strong>Show</strong> column of the
        Factors &amp; Levels tab (or add factors) to populate the matrix.
      </div>
    )
  }

  const stats = computeStats(visibleFactors, occurrenceMap, forbiddenMap)
  const hasTestSuite = testSuite !== null

  return (
    <div className="matrix">
      <MatrixExportToolbar
        visibleFactors={visibleFactors}
        occurrenceMap={occurrenceMap}
        forbiddenMap={forbiddenMap}
      />
      {hasTestSuite && stale.stale && (
        <div className="matrix__stale-banner" role="alert">
          <strong>Coverage may be misleading.</strong> The imported test set no
          longer matches the model (a factor or level was removed or renamed in
          the DSL), so some cells show as missed only because their cases can no
          longer be matched. Re-generate the set in the <strong>Test cases</strong> tab.
        </div>
      )}
      {!hasTestSuite && (
        <div className="matrix__no-suite-banner" role="status">
          <strong>No test cases imported.</strong> Cells show only the pair
          structure and DSL-derived forbidden marks (
          <span className="matrix__no-suite-banner-marker">{FORBIDDEN_MARK}</span>). Import
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
              f.levels.map(lv => {
                const v = String(lv.value)
                const isMask = v === MASK_LEVEL
                return (
                  <th
                    key={`col-level-${f.name}::${v}`}
                    className={
                      'matrix__level-header matrix__level-header--col' +
                      (isMask ? ' matrix__level-header--mask' : '')
                    }
                    scope="col"
                    title={isMask ? 'Mask level' : undefined}
                  >
                    {v}
                  </th>
                )
              }),
            )}
          </tr>
        </thead>
        <tbody>
          {visibleFactors.flatMap((rowFactor, rowFactorIdx) =>
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
                  className={
                    'matrix__level-header matrix__level-header--row' +
                    (String(rowLevel.value) === MASK_LEVEL
                      ? ' matrix__level-header--mask'
                      : '')
                  }
                  scope="row"
                  title={
                    String(rowLevel.value) === MASK_LEVEL
                      ? 'Mask level'
                      : undefined
                  }
                >
                  {String(rowLevel.value)}
                </th>
                {visibleFactors.flatMap((colFactor, colFactorIdx) =>
                  colFactor.levels.map(colLevel => {
                    const sameFactor = rowFactor.name === colFactor.name
                    const va = String(rowLevel.value)
                    const vb = String(colLevel.value)
                    const baseLabel = `${rowFactor.name}=${va}, ${colFactor.name}=${vb}`
                    if (sameFactor) {
                      return (
                        <td
                          key={`cell-${colFactor.name}::${vb}`}
                          className="matrix__cell matrix__cell--blocked"
                          aria-label="same factor (blocked)"
                        />
                      )
                    }
                    const info = occurrenceMap
                      ? occurrenceMap.get(pairKey(rowFactor.name, va, colFactor.name, vb))
                      : null
                    const forbidden = forbiddenMap
                      ? isForbidden(forbiddenMap, rowFactor.name, va, colFactor.name, vb)
                      : false

                    let display = ''
                    let cellClass = 'matrix__cell matrix__cell--pair'
                    let extraLabel = ''
                    const isUpperRight = colFactorIdx > rowFactorIdx

                    if (forbidden) {
                      display = FORBIDDEN_MARK
                      cellClass += ' matrix__cell--forbidden'
                      extraLabel = ': forbidden by DSL constraints'
                    } else if (occurrenceMap === null) {
                      display = '·'
                      cellClass += ' matrix__cell--placeholder'
                    } else if (!info || info.count === 0) {
                      display = '?'
                      cellClass += ' matrix__cell--missed'
                      extraLabel = ': allowed but no test case covers it'
                    } else {
                      cellClass += ' matrix__cell--covered'
                      if (isUpperRight) {
                        display = String(info.count)
                        cellClass += ' matrix__cell--count'
                        extraLabel =
                          `: ${info.count} test case` +
                          (info.count === 1 ? '' : 's') +
                          ` (rows ${info.ids.join(', ')})`
                      } else {
                        // Lower-left half: show only the first id; if there
                        // are more, show "+N" stacked below in a smaller
                        // font so both pieces fit in a 2em square cell. The
                        // full list is in the tooltip and in CSV exports.
                        const first = info.ids[0]!
                        const rest = info.ids.length - 1
                        cellClass += ' matrix__cell--ids'
                        extraLabel = `: covered by ${info.ids.join(', ')}`
                        return (
                          <td
                            key={`cell-${colFactor.name}::${vb}`}
                            className={cellClass}
                            title={baseLabel + extraLabel}
                            aria-label={baseLabel + extraLabel}
                          >
                            <span className="matrix__cell-content">
                              <span className="matrix__cell-first-id">
                                {first}
                              </span>
                              {rest > 0 && (
                                <span className="matrix__cell-rest">
                                  +{rest}
                                </span>
                              )}
                            </span>
                          </td>
                        )
                      }
                    }

                    return (
                      <td
                        key={`cell-${colFactor.name}::${vb}`}
                        className={cellClass}
                        title={baseLabel + extraLabel}
                        aria-label={baseLabel + extraLabel}
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
// Export toolbar: lets the user copy or download the rendered cross-tab
// matrix as TSV. The TSV uses the same cell values shown in the UI
// (numbers / FORBIDDEN_MARK / "?" / "—") so what you see is what you copy.
// =============================================================================

type MatrixExportToolbarProps = {
  visibleFactors: ParameterDecl[]
  occurrenceMap: OccurrenceMap | null
  forbiddenMap: ForbiddenMap | null
}

function MatrixExportToolbar({
  visibleFactors,
  occurrenceMap,
  forbiddenMap,
}: MatrixExportToolbarProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const html = matrixToHtml(visibleFactors, occurrenceMap, forbiddenMap)
    const csv = matrixToCsv(visibleFactors, occurrenceMap, forbiddenMap)
    const result = await copyTableToClipboard(html, csv)
    if (result.ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const onDownload = () => {
    const csv = matrixToCsv(visibleFactors, occurrenceMap, forbiddenMap)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'coverage-matrix.csv'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  return (
    <div className="matrix__export">
      <button
        type="button"
        className="matrix__export-btn"
        onClick={onCopy}
        title="Copy as HTML table + CSV (paste-friendly to Excel and plain-text editors / IDEs)"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        className="matrix__export-btn"
        onClick={onDownload}
        title="Download as CSV"
      >
        Download CSV
      </button>
    </div>
  )
}

function matrixToHtml(
  visibleFactors: ParameterDecl[],
  occurrenceMap: OccurrenceMap | null,
  forbiddenMap: ForbiddenMap | null,
): string {
  // Two header rows: factor names spanning their levels, then per-level
  // labels. We use colspan / rowspan so spreadsheet apps merge the cells
  // correctly on paste.
  const factorHeaderCells = ['<th></th>', '<th></th>']
  for (const f of visibleFactors) {
    factorHeaderCells.push(
      `<th colspan="${f.levels.length}">${escapeHtml(f.name)}</th>`,
    )
  }
  const levelHeaderCells = ['<th></th>', '<th></th>']
  for (const f of visibleFactors) {
    for (const lv of f.levels) {
      levelHeaderCells.push(`<th>${escapeHtml(String(lv.value))}</th>`)
    }
  }

  const bodyRows: string[] = []
  for (let rowFactorIdx = 0; rowFactorIdx < visibleFactors.length; rowFactorIdx++) {
    const rowF = visibleFactors[rowFactorIdx]!
    for (let i = 0; i < rowF.levels.length; i++) {
      const rowLevel = rowF.levels[i]!
      const cells: string[] = []
      if (i === 0) {
        cells.push(
          `<th rowspan="${rowF.levels.length}">${escapeHtml(rowF.name)}</th>`,
        )
      }
      cells.push(`<th>${escapeHtml(String(rowLevel.value))}</th>`)
      for (let colFactorIdx = 0; colFactorIdx < visibleFactors.length; colFactorIdx++) {
        const colF = visibleFactors[colFactorIdx]!
        for (const colLevel of colF.levels) {
          if (rowF.name === colF.name) {
            cells.push('<td>—</td>')
            continue
          }
          const va = String(rowLevel.value)
          const vb = String(colLevel.value)
          if (forbiddenMap && isForbidden(forbiddenMap, rowF.name, va, colF.name, vb)) {
            cells.push(`<td>${FORBIDDEN_MARK}</td>`)
            continue
          }
          if (!occurrenceMap) {
            cells.push('<td></td>')
            continue
          }
          const info = occurrenceMap.get(pairKey(rowF.name, va, colF.name, vb))
          if (!info || info.count === 0) {
            cells.push('<td>?</td>')
          } else if (colFactorIdx > rowFactorIdx) {
            cells.push(`<td>${info.count}</td>`)
          } else {
            cells.push(`<td>${escapeHtml(info.ids.join(', '))}</td>`)
          }
        }
      }
      bodyRows.push('<tr>' + cells.join('') + '</tr>')
    }
  }
  return (
    '<table>' +
    `<thead><tr>${factorHeaderCells.join('')}</tr><tr>${levelHeaderCells.join('')}</tr></thead>` +
    `<tbody>${bodyRows.join('')}</tbody>` +
    '</table>'
  )
}

function matrixToCsv(
  visibleFactors: ParameterDecl[],
  occurrenceMap: OccurrenceMap | null,
  forbiddenMap: ForbiddenMap | null,
): string {
  // RFC 4180 escaping: wrap cells containing comma / quote / newline in
  // double quotes, double up embedded quotes. The lower-left ID list
  // ("#1, #5, #12") contains commas and so always gets quoted.
  const escape = (s: string): string =>
    /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s

  // Two header rows: factor names spanning, then per-level labels.
  const factorHeader: string[] = ['', '']
  const levelHeader: string[] = ['', '']
  for (const f of visibleFactors) {
    for (let i = 0; i < f.levels.length; i++) {
      factorHeader.push(i === 0 ? f.name : '')
      levelHeader.push(String(f.levels[i]!.value))
    }
  }
  const lines: string[] = [
    factorHeader.map(escape).join(','),
    levelHeader.map(escape).join(','),
  ]

  for (let rowFactorIdx = 0; rowFactorIdx < visibleFactors.length; rowFactorIdx++) {
    const rowF = visibleFactors[rowFactorIdx]!
    for (let i = 0; i < rowF.levels.length; i++) {
      const rowLevel = rowF.levels[i]!
      const cells: string[] = []
      cells.push(i === 0 ? rowF.name : '')
      cells.push(String(rowLevel.value))
      for (let colFactorIdx = 0; colFactorIdx < visibleFactors.length; colFactorIdx++) {
        const colF = visibleFactors[colFactorIdx]!
        for (const colLevel of colF.levels) {
          if (rowF.name === colF.name) {
            cells.push('—')
            continue
          }
          const va = String(rowLevel.value)
          const vb = String(colLevel.value)
          if (forbiddenMap && isForbidden(forbiddenMap, rowF.name, va, colF.name, vb)) {
            cells.push(FORBIDDEN_MARK)
            continue
          }
          if (!occurrenceMap) {
            cells.push('')
            continue
          }
          const info = occurrenceMap.get(pairKey(rowF.name, va, colF.name, vb))
          if (!info || info.count === 0) {
            cells.push('?')
          } else if (colFactorIdx > rowFactorIdx) {
            cells.push(String(info.count))
          } else {
            cells.push(info.ids.join(', '))
          }
        }
      }
      lines.push(cells.map(escape).join(','))
    }
  }
  return lines.join('\n') + '\n'
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

type OccurrenceInfo = { count: number; ids: string[] }
type OccurrenceMap = Map<string, OccurrenceInfo>

/**
 * Count, for each pair of (factor, level) values, how many COUNTED test cases
 * include it (SR-042). Per UR-010 / SR-044 only flagged-in cases contribute:
 * rows with count === false and forbidden rows are skipped entirely, so a pair
 * covered only by flagged-out cases reads as missed. Returns null when there
 * is no test suite, so the matrix can render placeholder cells.
 */
function buildOccurrenceMap(suite: TestSuite | null): OccurrenceMap | null {
  if (!suite || suite.rows.length === 0) return null
  const map: OccurrenceMap = new Map()
  for (let r = 0; r < suite.rows.length; r++) {
    const row = suite.rows[r]!
    if (row.forbidden === true) continue
    if (row.count === false) continue
    const label = row.id ?? String(r + 1)
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
        let info = map.get(key)
        if (!info) {
          info = { count: 0, ids: [] }
          map.set(key, info)
        }
        info.count++
        info.ids.push(label)
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
  return map.get(pairKey(rowFactor, rowLevel, colFactor, colLevel))?.count ?? 0
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
