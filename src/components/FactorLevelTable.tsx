import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import './FactorLevelTable.css'

export function FactorLevelTable() {
  const model = useProjectStore(s => s.parseResult.model)
  const factorVisibility = useProjectStore(s => s.view.factorVisibility)
  const setFactorVisibility = useProjectStore(s => s.setFactorVisibility)
  const renameFactor = useProjectStore(s => s.renameFactor)
  const removeFactor = useProjectStore(s => s.removeFactor)
  const addFactor = useProjectStore(s => s.addFactor)
  const addLevelToFactor = useProjectStore(s => s.addLevelToFactor)
  const removeLevelFromFactor = useProjectStore(s => s.removeLevelFromFactor)

  const factors = model?.parameters ?? []

  return (
    <div className="factor-level-table">
      <table className="factor-level-table__table">
        <thead>
          <tr>
            <th className="factor-level-table__col-show" scope="col">Show</th>
            <th className="factor-level-table__col-name" scope="col">Factor</th>
            <th className="factor-level-table__col-count" scope="col">#</th>
            <th className="factor-level-table__col-levels" scope="col">Levels</th>
            <th className="factor-level-table__col-actions" scope="col" aria-label="Actions" />
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
                  {/* `key` forces a fresh mount when the name changes
                      (e.g., after a successful rename), so the inline
                      input's local draft state initializes from the new
                      prop without an effect. */}
                  <FactorNameCell
                    key={p.name}
                    name={p.name}
                    onCommit={newName => renameFactor(p.name, newName)}
                  />
                </td>
                <td className="factor-level-table__col-count">
                  {p.levels.length}
                </td>
                <td className="factor-level-table__col-levels">
                  <LevelChips
                    factorName={p.name}
                    levels={p.levels.map(l => ({ type: l.type, value: String(l.value) }))}
                    onAdd={value => addLevelToFactor(p.name, value)}
                    onRemove={value => removeLevelFromFactor(p.name, value)}
                  />
                </td>
                <td className="factor-level-table__col-actions">
                  <button
                    type="button"
                    className="factor-level-table__remove"
                    title="Remove this factor"
                    aria-label={`Remove factor ${p.name}`}
                    onClick={() => {
                      if (window.confirm(
                        `Remove factor "${p.name}"? Constraints that reference it will be left in place and will surface as DSL errors until you fix them.`,
                      )) {
                        removeFactor(p.name)
                      }
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            )
          })}
          <tr className="factor-level-table__add-row">
            <td colSpan={5}>
              <AddFactorRow onAdd={addFactor} existingNames={factors.map(f => f.name)} />
            </td>
          </tr>
        </tbody>
      </table>
      {factors.length === 0 ? (
        <p className="factor-level-table__hint">
          No factors yet — add one above, or write parameter declarations directly
          in the DSL tab.
        </p>
      ) : (
        <p className="factor-level-table__hint">
          Rename a factor to update all <code>[refs]</code> in constraints
          automatically. Level renames must currently be done in the DSL tab
          (constraint references aren&apos;t auto-rewritten yet).
        </p>
      )}
    </div>
  )
}

// =============================================================================
// Factor name cell with inline edit
// =============================================================================

type FactorNameCellProps = {
  name: string
  onCommit: (newName: string) => void
}

function FactorNameCell({ name, onCommit }: FactorNameCellProps) {
  const [draft, setDraft] = useState(name)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0 || trimmed === name) {
      setDraft(name)
      return
    }
    onCommit(trimmed)
  }

  return (
    <input
      type="text"
      className="factor-level-table__name-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(name)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      aria-label={`Factor name (${name})`}
    />
  )
}

// =============================================================================
// Level chips with add / remove
// =============================================================================

type LevelChipsProps = {
  factorName: string
  levels: Array<{ type: 'string' | 'number' | 'identifier'; value: string }>
  onAdd: (levelValue: string) => void
  onRemove: (levelValue: string) => void
}

function LevelChips({ factorName, levels, onAdd, onRemove }: LevelChipsProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commitAdd = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setAdding(false)
      setDraft('')
      return
    }
    onAdd(trimmed)
    setAdding(false)
    setDraft('')
  }

  return (
    <div className="factor-level-table__levels">
      {levels.map(lv => (
        <span
          key={`${factorName}::${lv.value}`}
          className={
            'factor-level-table__level factor-level-table__level--' + lv.type
          }
        >
          <span className="factor-level-table__level-text">{lv.value}</span>
          <button
            type="button"
            className="factor-level-table__level-remove"
            title="Remove this level"
            aria-label={`Remove level ${lv.value} from ${factorName}`}
            disabled={levels.length <= 1}
            onClick={() => onRemove(lv.value)}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <span className="factor-level-table__level factor-level-table__level--editing">
          <input
            type="text"
            className="factor-level-table__level-input"
            value={draft}
            placeholder="new level"
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={e => {
              if (e.key === 'Enter') commitAdd()
              else if (e.key === 'Escape') {
                setAdding(false)
                setDraft('')
              }
            }}
          />
        </span>
      ) : (
        <button
          type="button"
          className="factor-level-table__level-add"
          aria-label={`Add level to ${factorName}`}
          title="Add a level"
          onClick={() => setAdding(true)}
        >
          +
        </button>
      )}
    </div>
  )
}

// =============================================================================
// Add-factor row
// =============================================================================

type AddFactorRowProps = {
  onAdd: (name: string, levels?: string[]) => void
  existingNames: string[]
}

function AddFactorRow({ onAdd, existingNames }: AddFactorRowProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    if (existingNames.includes(trimmed)) {
      window.alert(`A factor named "${trimmed}" already exists.`)
      return
    }
    onAdd(trimmed)
    setDraft('')
  }

  return (
    <div className="factor-level-table__add-row-content">
      <input
        type="text"
        className="factor-level-table__add-input"
        value={draft}
        placeholder="New factor name"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
        }}
        aria-label="New factor name"
      />
      <button
        type="button"
        className="factor-level-table__add-button"
        onClick={submit}
        disabled={draft.trim().length === 0}
      >
        + Add factor
      </button>
      <span className="factor-level-table__add-hint">
        Adds a factor with two placeholder levels you can edit afterwards.
      </span>
    </div>
  )
}
