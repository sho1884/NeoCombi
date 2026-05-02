import { useProjectStore } from '../stores/projectStore'
import type { Diagnostic } from '../types/dsl'
import './DslEditor.css'

export function DslEditor() {
  const source = useProjectStore(s => s.source)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)
  const setSource = useProjectStore(s => s.setSource)

  return (
    <div className="dsl-editor">
      <textarea
        className="dsl-editor__textarea"
        value={source}
        onChange={e => setSource(e.target.value)}
        spellCheck={false}
        placeholder={EXAMPLE_PLACEHOLDER}
        aria-label="DSL source"
      />
      <DiagnosticsPanel diagnostics={diagnostics} />
    </div>
  )
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <div className="dsl-editor__diagnostics dsl-editor__diagnostics--ok">
        No issues — DSL parses cleanly.
      </div>
    )
  }
  return (
    <div className="dsl-editor__diagnostics">
      <div className="dsl-editor__diagnostics-header">
        {diagnostics.length} {diagnostics.length === 1 ? 'issue' : 'issues'}
      </div>
      <ul className="dsl-editor__diagnostics-list">
        {diagnostics.map((d, idx) => (
          <li
            key={`${d.range.start.offset}-${idx}`}
            className={
              'dsl-editor__diagnostic dsl-editor__diagnostic--' + d.kind
            }
          >
            <span className="dsl-editor__diagnostic-loc">
              {d.range.start.line}:{d.range.start.column}
            </span>
            <span className="dsl-editor__diagnostic-kind">{d.kind}</span>
            <span className="dsl-editor__diagnostic-message">{d.message}</span>
            {d.hint ? (
              <span className="dsl-editor__diagnostic-hint">{d.hint}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const EXAMPLE_PLACEHOLDER = `# Example
OS:      Linux, Windows, macOS
Browser: Chrome, Firefox, Safari

IF [OS] = "Linux" THEN [Browser] <> "Safari";
`
