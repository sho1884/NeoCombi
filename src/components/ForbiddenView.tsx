import { useMemo, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { computeForbiddenSlice } from '../engines/dsl'
import type { ForbiddenSliceCell } from '../types/dsl'
import type { ForbiddenSliceConfig } from '../types/project'
import './ForbiddenView.css'

export function ForbiddenView() {
  const model = useProjectStore(s => s.parseResult.model)
  const slices = useProjectStore(s => s.view.forbiddenSlices)
  const activeIdx = useProjectStore(s => s.view.activeSliceIndex)
  const addSlice = useProjectStore(s => s.addForbiddenSlice)
  const updateSlice = useProjectStore(s => s.updateActiveSlice)
  const removeSlice = useProjectStore(s => s.removeForbiddenSlice)
  const setActive = useProjectStore(s => s.setActiveSliceIndex)

  const factors = model?.parameters ?? []
  const factorNames = factors.map(f => f.name)
  const activeSlice = activeIdx >= 0 ? slices[activeIdx] : undefined

  if (factors.length < 2) {
    return (
      <div className="forbidden-view__empty">
        Declare at least two factors in the DSL editor or Factors &amp; Levels
        tab to compute forbidden combinations (SR-030..033).
      </div>
    )
  }

  return (
    <div className="forbidden-view">
      <SliceTabs
        slices={slices}
        activeIdx={activeIdx}
        onSelect={setActive}
        onAdd={() => addSlice()}
        onRemove={removeSlice}
      />

      {activeSlice ? (
        <SliceEditor
          slice={activeSlice}
          factorNames={factorNames}
          onChange={updateSlice}
        />
      ) : (
        <div className="forbidden-view__hint">
          No slice selected. Click <strong>+ Slice</strong> above to start a new
          forbidden-matrix configuration.
        </div>
      )}

      {activeSlice ? <SliceResult slice={activeSlice} /> : null}
    </div>
  )
}

// =============================================================================
// Slice tabs
// =============================================================================

type SliceTabsProps = {
  slices: ForbiddenSliceConfig[]
  activeIdx: number
  onSelect: (idx: number) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}

function SliceTabs({ slices, activeIdx, onSelect, onAdd, onRemove }: SliceTabsProps) {
  return (
    <div className="forbidden-view__tabs" role="tablist">
      {slices.map((s, idx) => {
        const active = idx === activeIdx
        const label = sliceLabel(s, idx)
        return (
          <span
            key={`slice-${idx}`}
            className={
              'forbidden-view__tab' +
              (active ? ' forbidden-view__tab--active' : '')
            }
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="forbidden-view__tab-button"
              onClick={() => onSelect(idx)}
            >
              {label}
            </button>
            <button
              type="button"
              className="forbidden-view__tab-close"
              aria-label={`Remove slice ${idx + 1}`}
              title="Remove this slice"
              onClick={() => onRemove(idx)}
            >
              ×
            </button>
          </span>
        )
      })}
      <button
        type="button"
        className="forbidden-view__tab-add"
        onClick={onAdd}
      >
        + Slice
      </button>
    </div>
  )
}

function sliceLabel(s: ForbiddenSliceConfig, idx: number): string {
  if (s.conditionFactors.length === 0 && !s.constrainedFactor) {
    return `Slice ${idx + 1} (empty)`
  }
  const cond = s.conditionFactors.join(', ') || '(none)'
  const constr = s.constrainedFactor ?? '(none)'
  return `${cond} → ${constr}`
}

// =============================================================================
// Slice editor: pick condition / constrained factors
// =============================================================================

type SliceEditorProps = {
  slice: ForbiddenSliceConfig
  factorNames: string[]
  onChange: (slice: ForbiddenSliceConfig) => void
}

function SliceEditor({ slice, factorNames, onChange }: SliceEditorProps) {
  const isCondition = (name: string) => slice.conditionFactors.includes(name)

  const toggleCondition = (name: string, checked: boolean) => {
    let nextCondition: string[]
    if (checked) {
      nextCondition = [...slice.conditionFactors, name]
    } else {
      nextCondition = slice.conditionFactors.filter(n => n !== name)
    }
    onChange({ ...slice, conditionFactors: nextCondition })
  }

  const setConstrained = (name: string) => {
    const cleaned = slice.conditionFactors.filter(n => n !== name)
    onChange({
      ...slice,
      conditionFactors: cleaned,
      constrainedFactor: name === '' ? null : name,
    })
  }

  return (
    <div className="forbidden-view__editor">
      <div className="forbidden-view__editor-row">
        <label className="forbidden-view__editor-label" htmlFor="constrained-factor">
          Constrained factor:
        </label>
        <select
          id="constrained-factor"
          className="forbidden-view__editor-select"
          value={slice.constrainedFactor ?? ''}
          onChange={e => setConstrained(e.target.value)}
        >
          <option value="">— select a factor —</option>
          {factorNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="forbidden-view__editor-row">
        <span className="forbidden-view__editor-label">Condition factors:</span>
        <div className="forbidden-view__editor-chips">
          {factorNames
            .filter(n => n !== slice.constrainedFactor)
            .map(name => (
              <label key={name} className="forbidden-view__editor-chip">
                <input
                  type="checkbox"
                  checked={isCondition(name)}
                  onChange={e => toggleCondition(name, e.target.checked)}
                />
                <span>{name}</span>
              </label>
            ))}
          {factorNames.length > 0 &&
            factorNames.filter(n => n !== slice.constrainedFactor).length === 0 && (
              <span className="forbidden-view__editor-hint">
                (no other factors available)
              </span>
            )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Slice result: forbidden matrix
// =============================================================================

type SliceResultProps = {
  slice: ForbiddenSliceConfig
}

function SliceResult({ slice }: SliceResultProps) {
  const model = useProjectStore(s => s.parseResult.model)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)

  const result = useMemo(() => {
    if (!model) return null
    if (diagnostics.length > 0) return null
    if (slice.conditionFactors.length === 0 || !slice.constrainedFactor) return null
    return computeForbiddenSlice(
      model,
      [...slice.conditionFactors, slice.constrainedFactor],
    )
  }, [model, diagnostics, slice.conditionFactors, slice.constrainedFactor])

  if (!model || diagnostics.length > 0) {
    return (
      <div className="forbidden-view__hint">
        Fix DSL diagnostics to compute the forbidden matrix.
      </div>
    )
  }
  if (slice.conditionFactors.length === 0 || !slice.constrainedFactor) {
    return (
      <div className="forbidden-view__hint">
        Select at least one condition factor and a constrained factor above.
      </div>
    )
  }
  if (!result) return null
  if (!result.ok) {
    return (
      <div className="forbidden-view__error">
        Cannot compute slice ({result.reason}): {result.message}
      </div>
    )
  }

  return (
    <>
      <ForbiddenExportToolbar
        conditionFactors={slice.conditionFactors}
        constrainedFactor={slice.constrainedFactor}
        cells={result.value.cells}
      />
      <ForbiddenMatrix
        conditionFactors={slice.conditionFactors}
        constrainedFactor={slice.constrainedFactor}
        cells={result.value.cells}
      />
    </>
  )
}

type ForbiddenExportToolbarProps = {
  conditionFactors: string[]
  constrainedFactor: string
  cells: ForbiddenSliceCell[]
}

function ForbiddenExportToolbar({
  conditionFactors,
  constrainedFactor,
  cells,
}: ForbiddenExportToolbarProps) {
  const [copied, setCopied] = useState(false)
  const buildTsv = () =>
    forbiddenSliceToTsv(conditionFactors, constrainedFactor, cells)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildTsv())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  const onDownload = () => {
    const blob = new Blob([buildTsv()], {
      type: 'text/tab-separated-values;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forbidden-${constrainedFactor}.tsv`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }
  return (
    <div className="forbidden-view__export">
      <button type="button" className="forbidden-view__export-btn" onClick={onCopy}>
        {copied ? '✓ Copied' : 'Copy TSV'}
      </button>
      <button type="button" className="forbidden-view__export-btn" onClick={onDownload}>
        Download TSV
      </button>
    </div>
  )
}

function forbiddenSliceToTsv(
  conditionFactors: string[],
  constrainedFactor: string,
  cells: ForbiddenSliceCell[],
): string {
  const constrainedLevels: string[] = []
  for (const c of cells) {
    const v = String(c.assignment[constrainedFactor])
    if (!constrainedLevels.includes(v)) constrainedLevels.push(v)
  }
  const rowMap = new Map<string, { tuple: string[]; cells: ForbiddenSliceCell[] }>()
  for (const c of cells) {
    const tuple = conditionFactors.map(f => String(c.assignment[f]))
    const key = tuple.join('||')
    let row = rowMap.get(key)
    if (!row) {
      row = { tuple, cells: [] }
      rowMap.set(key, row)
    }
    row.cells.push(c)
  }
  const rows = Array.from(rowMap.values())

  const headerFactors = [
    ...conditionFactors,
    constrainedFactor,
  ]
  const lines: string[] = [headerFactors.join('\t')]
  // Sub-header for the constrained columns.
  const subHeader = [
    ...conditionFactors.map(() => ''),
    ...constrainedLevels,
  ]
  // Replace last conditionFactors slot count + add column-level labels.
  // Actually, render two header rows: factor names then level labels.
  const factorRow = [...conditionFactors, constrainedFactor + ' levels →']
  const levelRow = [...conditionFactors.map(() => ''), ...constrainedLevels]
  void subHeader
  void headerFactors
  lines.length = 0
  lines.push(factorRow.join('\t'))
  lines.push(levelRow.join('\t'))
  for (const row of rows) {
    const cells_: string[] = [...row.tuple]
    for (const colLv of constrainedLevels) {
      const cell = row.cells.find(
        c => String(c.assignment[constrainedFactor]) === colLv,
      )
      cells_.push(cell?.forbidden ? '✗' : '·')
    }
    lines.push(cells_.join('\t'))
  }
  return lines.join('\n') + '\n'
}

type ForbiddenMatrixProps = {
  conditionFactors: string[]
  constrainedFactor: string
  cells: ForbiddenSliceCell[]
}

function ForbiddenMatrix({
  conditionFactors,
  constrainedFactor,
  cells,
}: ForbiddenMatrixProps) {
  // Distinct constrained-factor levels in cell order (preserves enumeration order).
  const constrainedLevels: string[] = []
  for (const c of cells) {
    const v = String(c.assignment[constrainedFactor])
    if (!constrainedLevels.includes(v)) constrainedLevels.push(v)
  }

  // Group cells by condition tuple (joined string), preserving discovery order.
  const rowMap = new Map<string, { tuple: string[]; cells: ForbiddenSliceCell[] }>()
  for (const c of cells) {
    const tuple = conditionFactors.map(f => String(c.assignment[f]))
    const key = tuple.join('||')
    let row = rowMap.get(key)
    if (!row) {
      row = { tuple, cells: [] }
      rowMap.set(key, row)
    }
    row.cells.push(c)
  }
  const rows = Array.from(rowMap.values())

  return (
    <div className="forbidden-view__matrix-wrap">
      <table className="forbidden-view__matrix" role="grid">
        <thead>
          <tr>
            {conditionFactors.map(name => (
              <th key={`cond-${name}`} className="forbidden-view__factor-th">
                {name}
              </th>
            ))}
            <th
              className="forbidden-view__factor-th forbidden-view__factor-th--constrained"
              colSpan={Math.max(constrainedLevels.length, 1)}
            >
              {constrainedFactor}
            </th>
          </tr>
          <tr>
            {conditionFactors.map(name => (
              <th key={`cond-empty-${name}`} aria-hidden="true" className="forbidden-view__corner" />
            ))}
            {constrainedLevels.map(lv => (
              <th
                key={`col-${lv}`}
                className="forbidden-view__level-th forbidden-view__level-th--col"
                scope="col"
              >
                {lv}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={`row-${rIdx}`}>
              {row.tuple.map((lv, cIdx) => (
                <th
                  key={`row-${rIdx}-cond-${cIdx}`}
                  className="forbidden-view__level-th forbidden-view__level-th--row"
                  scope="row"
                >
                  {lv}
                </th>
              ))}
              {constrainedLevels.map(colLv => {
                const cell = row.cells.find(
                  c => String(c.assignment[constrainedFactor]) === colLv,
                )
                if (!cell) return <td key={`row-${rIdx}-${colLv}-na`} className="forbidden-view__cell" />
                return (
                  <td
                    key={`row-${rIdx}-${colLv}`}
                    className={
                      'forbidden-view__cell ' +
                      (cell.forbidden
                        ? 'forbidden-view__cell--forbidden'
                        : 'forbidden-view__cell--allowed')
                    }
                    aria-label={
                      conditionFactors
                        .map((f, i) => `${f}=${row.tuple[i]}`)
                        .join(', ') +
                      `, ${constrainedFactor}=${colLv}: ` +
                      (cell.forbidden ? 'forbidden' : 'allowed')
                    }
                  >
                    {cell.forbidden ? '✗' : '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
