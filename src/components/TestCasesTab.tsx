import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { parseCsv } from '../services/csvImport'
import './TestCasesTab.css'

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestSuite = useProjectStore(s => s.setTestSuite)
  const setTestCaseExpected = useProjectStore(s => s.setTestCaseExpected)

  const [error, setError] = useState<string | null>(null)

  const onImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.tsv,text/csv,text/plain'
    input.style.display = 'none'
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input)
    }
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        const { suite, warnings } = parseCsv(text)
        if (suite.factorOrder.length === 0) {
          setError('No header row found in the imported file.')
          return
        }
        setTestSuite(suite)
        if (warnings.length > 0) {
          setError(`${warnings.length} row(s) had warnings; imported the rest.`)
        } else {
          setError(null)
        }
      } catch (e) {
        setError(`Failed to import: ${(e as Error).message}`)
      } finally {
        cleanup()
      }
    })
    // Some browsers require the input be in the DOM to trigger the picker.
    document.body.appendChild(input)
    input.click()
  }

  if (!testSuite || testSuite.rows.length === 0) {
    return (
      <div className="test-cases-tab">
        <div className="test-cases-tab__toolbar">
          <button type="button" className="test-cases-tab__import" onClick={onImport}>
            Import CSV…
          </button>
          {error ? <span className="test-cases-tab__error">{error}</span> : null}
        </div>
        <div className="test-cases-tab__empty">
          <p>
            No test cases yet. Generate them via the CLI and import the result here:
          </p>
          <pre className="test-cases-tab__example">
{`# in your terminal:
neocombi generate yourproject.tmodel --format csv --output cases.csv

# then click "Import CSV…" above and pick cases.csv`}
          </pre>
          <p className="test-cases-tab__hint">
            Direct in-GUI PICT execution requires a desktop wrapper (Tauri /
            Electron) or a local backend; that ADR is still pending. The CLI
            path works today.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="test-cases-tab">
      <div className="test-cases-tab__toolbar">
        <span className="test-cases-tab__count">
          {testSuite.rows.length} test case{testSuite.rows.length === 1 ? '' : 's'},
          {' '}
          {testSuite.factorOrder.length} factor
          {testSuite.factorOrder.length === 1 ? '' : 's'}
        </span>
        <button type="button" className="test-cases-tab__import" onClick={onImport}>
          Re-import…
        </button>
        <button
          type="button"
          className="test-cases-tab__clear"
          onClick={() => setTestSuite(null)}
        >
          Clear
        </button>
        {error ? <span className="test-cases-tab__error">{error}</span> : null}
      </div>

      <div className="test-cases-tab__table-wrap">
        <table className="test-cases-tab__table">
          <thead>
            <tr>
              <th className="test-cases-tab__col-idx">#</th>
              {testSuite.factorOrder.map(name => (
                <th key={`h-${name}`} scope="col">{name}</th>
              ))}
              <th className="test-cases-tab__col-expected" scope="col">Expected</th>
            </tr>
          </thead>
          <tbody>
            {testSuite.rows.map((row, idx) => (
              <tr key={`r-${idx}`}>
                <th className="test-cases-tab__col-idx" scope="row">{idx + 1}</th>
                {testSuite.factorOrder.map(name => (
                  <td key={`r-${idx}-${name}`} className="test-cases-tab__cell">
                    {row.values[name] ?? ''}
                  </td>
                ))}
                <td className="test-cases-tab__col-expected">
                  <ExpectedCell
                    initial={row.expected ?? ''}
                    onCommit={value => setTestCaseExpected(idx, value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type ExpectedCellProps = {
  initial: string
  onCommit: (value: string) => void
}

function ExpectedCell({ initial, onCommit }: ExpectedCellProps) {
  const [draft, setDraft] = useState(initial)

  const commit = () => {
    if (draft === initial) return
    onCommit(draft)
  }

  return (
    <input
      type="text"
      className="test-cases-tab__expected-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') {
          setDraft(initial)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder="(no expected value)"
      aria-label="Expected value"
    />
  )
}
