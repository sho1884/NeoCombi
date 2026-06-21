import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { Diagnostic } from '../types/dsl'
import './DslEditor.css'

const MASK_FACTOR_PATTERN = /^Factor \[([^\]]+)\] has a _MASK_/

export function DslEditor() {
  const source = useProjectStore(s => s.source)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)
  const setSource = useProjectStore(s => s.setSource)
  const setBottomPaneTab = useProjectStore(s => s.setBottomPaneTab)

  // SR-092: clicking an unbound-mask-level warning jumps to the offending
  // factor's row in the Factor / Level table. Switches the bottom-pane tab
  // first, then scrolls — the row markup carries data-factor-name as the
  // anchor.
  const focusFactor = (factorName: string) => {
    setBottomPaneTab('factors')
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-factor-name="${CSS.escape(factorName)}"]`,
      )
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      row?.classList.add('factor-level-table__row--flash')
      setTimeout(() => {
        row?.classList.remove('factor-level-table__row--flash')
      }, 1500)
    })
  }

  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (source.length === 0) return
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select-all in the textarea so the user can Ctrl-C manually.
      const ta = document.querySelector<HTMLTextAreaElement>('.dsl-editor__textarea')
      ta?.select()
    }
  }

  // Download the DSL as a .ncombi model file (DSL + generation settings, no
  // test set). A direct file download — distinct from File -> Save, which keeps
  // an editable handle to the project. Mirrors the Test cases tab's Download.
  const onDownload = () => {
    if (source.length === 0) return
    const text = useProjectStore.getState().toModelFile()
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'model.ncombi'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  return (
    <div className="dsl-editor">
      <div className="dsl-editor__toolbar">
        <button
          type="button"
          className="dsl-editor__copy"
          onClick={onCopy}
          disabled={source.length === 0}
          title="Copy the DSL source to the clipboard"
        >
          {copied ? 'Copied' : 'Copy DSL'}
        </button>
        <button
          type="button"
          className="dsl-editor__download"
          onClick={onDownload}
          disabled={source.length === 0}
          title="Download the DSL as a .ncombi model file"
        >
          Download .ncombi
        </button>
      </div>
      <textarea
        className="dsl-editor__textarea"
        value={source}
        onChange={e => setSource(e.target.value)}
        spellCheck={false}
        placeholder={EXAMPLE_PLACEHOLDER}
        aria-label="DSL source"
      />
      <DiagnosticsPanel
        diagnostics={diagnostics}
        onFactorJump={focusFactor}
      />
    </div>
  )
}

type DiagnosticsPanelProps = {
  diagnostics: readonly Diagnostic[]
  onFactorJump: (factorName: string) => void
}

function DiagnosticsPanel({ diagnostics, onFactorJump }: DiagnosticsPanelProps) {
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
        {diagnostics.map((d, idx) => {
          const maskMatch =
            d.kind === 'unbound-mask-level'
              ? d.message.match(MASK_FACTOR_PATTERN)
              : null
          const factorName = maskMatch?.[1] ?? null
          const className =
            'dsl-editor__diagnostic ' +
            'dsl-editor__diagnostic--severity-' + d.severity + ' ' +
            'dsl-editor__diagnostic--' + d.kind +
            (factorName ? ' dsl-editor__diagnostic--clickable' : '')
          const inner = (
            <>
              <span className="dsl-editor__diagnostic-loc">
                {d.range.start.line}:{d.range.start.column}
              </span>
              <span className="dsl-editor__diagnostic-kind">{d.kind}</span>
              <span className="dsl-editor__diagnostic-message">{d.message}</span>
              {d.hint ? (
                <span className="dsl-editor__diagnostic-hint">{d.hint}</span>
              ) : null}
            </>
          )
          if (factorName) {
            return (
              <li
                key={`${d.range.start.offset}-${idx}`}
                className={className}
              >
                <button
                  type="button"
                  className="dsl-editor__diagnostic-button"
                  onClick={() => onFactorJump(factorName)}
                  title={`Jump to factor [${factorName}] in the Factors & Levels tab`}
                >
                  {inner}
                </button>
              </li>
            )
          }
          return (
            <li
              key={`${d.range.start.offset}-${idx}`}
              className={className}
            >
              {inner}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const EXAMPLE_PLACEHOLDER = `# Example
OS:      Linux, Windows, macOS
Browser: Chrome, Firefox, Safari

IF [OS] = "Linux" THEN [Browser] <> "Safari";
`
