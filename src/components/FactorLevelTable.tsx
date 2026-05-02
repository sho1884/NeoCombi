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
  const renameLevel = useProjectStore(s => s.renameLevel)
  const moveFactor = useProjectStore(s => s.moveFactor)
  const moveLevel = useProjectStore(s => s.moveLevel)

  const factors = model?.parameters ?? []

  return (
    <div className="factor-level-table">
      <table className="factor-level-table__table">
        <thead>
          <tr>
            <th className="factor-level-table__col-show" scope="col">Show</th>
            <th className="factor-level-table__col-order" scope="col" aria-label="Reorder" />
            <th className="factor-level-table__col-name" scope="col">Factor</th>
            <th className="factor-level-table__col-count" scope="col">#</th>
            <th className="factor-level-table__col-levels" scope="col">Levels</th>
            <th className="factor-level-table__col-actions" scope="col" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {factors.map((p, idx) => {
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
                <td className="factor-level-table__col-order">
                  <button
                    type="button"
                    className="factor-level-table__order-btn"
                    onClick={() => moveFactor(p.name, 'up')}
                    disabled={idx === 0}
                    title="Move factor up"
                    aria-label={`Move ${p.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="factor-level-table__order-btn"
                    onClick={() => moveFactor(p.name, 'down')}
                    disabled={idx === factors.length - 1}
                    title="Move factor down"
                    aria-label={`Move ${p.name} down`}
                  >
                    ↓
                  </button>
                </td>
                <td className="factor-level-table__col-name">
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
                    levels={p.levels.map((l, levelIdx) => ({
                      type: l.type,
                      value: String(l.value),
                      idx: levelIdx,
                    }))}
                    onAdd={value => addLevelToFactor(p.name, value)}
                    onRemove={value => removeLevelFromFactor(p.name, value)}
                    onRename={(oldValue, newValue) =>
                      renameLevel(p.name, oldValue, newValue)
                    }
                    onMove={(value, direction) => moveLevel(p.name, value, direction)}
                  />
                </td>
                <td className="factor-level-table__col-actions">
                  <button
                    type="button"
                    className="factor-level-table__remove"
                    title={`Remove factor ${p.name}`}
                    aria-label={`Remove factor ${p.name}`}
                    onClick={() => {
                      if (window.confirm(
                        `Remove factor "${p.name}"? Constraints that reference it will be left in place and will surface as DSL errors until you fix them.`,
                      )) {
                        removeFactor(p.name)
                      }
                    }}
                  >
                    ✕ Remove
                  </button>
                </td>
              </tr>
            )
          })}
          <tr className="factor-level-table__add-row">
            <td colSpan={6}>
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
          Click a factor or level name to rename it; constraint references
          update automatically. Use ↑ / ↓ to reorder, ← / → on a level chip to
          shuffle within a factor, and × to remove.
        </p>
      )}
    </div>
  )
}

// =============================================================================
// Inline factor-name editor
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
// Level chips: rename / move / remove
// =============================================================================

type LevelEntry = {
  type: 'string' | 'number' | 'identifier'
  value: string
  idx: number
}

type LevelChipsProps = {
  factorName: string
  levels: LevelEntry[]
  onAdd: (value: string) => void
  onRemove: (value: string) => void
  onRename: (oldValue: string, newValue: string) => void
  onMove: (value: string, direction: 'up' | 'down') => void
}

function LevelChips({
  factorName,
  levels,
  onAdd,
  onRemove,
  onRename,
  onMove,
}: LevelChipsProps) {
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
        <LevelChip
          key={`${factorName}::${lv.value}`}
          factorName={factorName}
          level={lv}
          isFirst={lv.idx === 0}
          isLast={lv.idx === levels.length - 1}
          canRemove={levels.length > 1}
          onRename={onRename}
          onRemove={onRemove}
          onMove={onMove}
        />
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

type LevelChipProps = {
  factorName: string
  level: LevelEntry
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  onRename: (oldValue: string, newValue: string) => void
  onRemove: (value: string) => void
  onMove: (value: string, direction: 'up' | 'down') => void
}

function LevelChip({
  factorName,
  level,
  isFirst,
  isLast,
  canRemove,
  onRename,
  onRemove,
  onMove,
}: LevelChipProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(level.value)

  const commitEdit = () => {
    const trimmed = draft.trim()
    setEditing(false)
    if (trimmed.length === 0 || trimmed === level.value) {
      setDraft(level.value)
      return
    }
    onRename(level.value, trimmed)
  }

  return (
    <span
      className={
        'factor-level-table__level factor-level-table__level--' + level.type
      }
    >
      <button
        type="button"
        className="factor-level-table__level-move"
        onClick={() => onMove(level.value, 'up')}
        disabled={isFirst}
        title="Move left"
        aria-label={`Move level ${level.value} left in ${factorName}`}
      >
        ‹
      </button>
      {editing ? (
        <input
          type="text"
          className="factor-level-table__level-input"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setDraft(level.value)
              setEditing(false)
            }
          }}
          aria-label={`Rename level ${level.value} of ${factorName}`}
        />
      ) : (
        <button
          type="button"
          className="factor-level-table__level-text"
          onClick={() => {
            setDraft(level.value)
            setEditing(true)
          }}
          title="Click to rename"
        >
          {level.value}
        </button>
      )}
      <button
        type="button"
        className="factor-level-table__level-move"
        onClick={() => onMove(level.value, 'down')}
        disabled={isLast}
        title="Move right"
        aria-label={`Move level ${level.value} right in ${factorName}`}
      >
        ›
      </button>
      <button
        type="button"
        className="factor-level-table__level-remove"
        title="Remove this level"
        aria-label={`Remove level ${level.value} from ${factorName}`}
        disabled={!canRemove}
        onClick={() => onRemove(level.value)}
      >
        ×
      </button>
    </span>
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
