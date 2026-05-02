import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { runGenerate } from '../services/runGenerate'
import { formatTestSuite, testSuiteToHtml } from '../engines/pict'
import { copyTableToClipboard } from '../services/clipboardWrite'
import './TestCasesTab.css'

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestCaseExpected = useProjectStore(s => s.setTestCaseExpected)
  const source = useProjectStore(s => s.source)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)

  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  // GUI exposes only the two formats engineers actually paste / commit:
  // CSV for code editors and test-automation tooling, JSON for parametrised
  // test runners. TSV stays available in the CLI for spreadsheet pipelines.
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [copied, setCopied] = useState(false)

  const dslHasErrors = diagnostics.some(d => d.severity === 'error')

  const onManualGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const result = await runGenerate()
      switch (result.kind) {
        case 'ok':
          break
        case 'skipped':
          setError(`Cannot generate: ${result.reason.replace('-', ' ')}`)
          break
        case 'network-error':
          setError(
            `Cannot reach the PICT service: ${result.message}. Start it with \`docker compose up pict-service\`.`,
          )
          break
        case 'pict-error':
          setError(
            `PICT rejected the model: ${result.message}` +
              (result.stderr ? ' — ' + result.stderr : ''),
          )
          break
        case 'service-error':
          setError(`Service error (${result.status}): ${result.message}`)
          break
        case 'empty-result':
          setError('PICT returned an empty result.')
          break
      }
    } catch (e) {
      setError(`Unexpected error while generating: ${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Export / copy actions (only meaningful when there is a suite to export)
  // ---------------------------------------------------------------------------

  const onCopy = async () => {
    if (!testSuite) return
    // Always copy BOTH text/html and text/plain (TSV) so paste works in
    // Excel / Sheets (they prefer HTML) and in plain-text editors (TSV).
    const html = testSuiteToHtml(testSuite)
    const tsv = formatTestSuite(testSuite, 'tsv')
    const result = await copyTableToClipboard(html, tsv)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setError(null)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const onDownload = () => {
    if (!testSuite) return
    const text = formatTestSuite(testSuite, format)
    const ext = format === 'json' ? 'json' : 'csv'
    const mime =
      format === 'json'
        ? 'application/json;charset=utf-8'
        : 'text/csv;charset=utf-8'
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cases.${ext}`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!testSuite || testSuite.rows.length === 0) {
    return (
      <div className="test-cases-tab">
        <div className="test-cases-tab__toolbar">
          <button
            type="button"
            className="test-cases-tab__generate"
            onClick={() => void onManualGenerate()}
            disabled={generating || dslHasErrors || source.length === 0}
            title={
              dslHasErrors
                ? 'Fix DSL errors before generating'
                : source.length === 0
                  ? 'Write some DSL first'
                  : 'Generate test cases via the pict-service Docker container'
            }
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
          {error ? <span className="test-cases-tab__error">{error}</span> : null}
        </div>
        <div className="test-cases-tab__no-suite">
          <h2 className="test-cases-tab__no-suite-title">No test cases yet</h2>
          <p className="test-cases-tab__no-suite-lede">
            Add factors and levels (DSL or Factors &amp; Levels tab); test cases
            will be generated automatically once the DSL parses cleanly. Or click{' '}
            <strong>Generate</strong> to run PICT immediately via the
            <code> pict-service </code>Docker container.
          </p>
          <p className="test-cases-tab__no-suite-lede">
            If the service is not running yet:
          </p>
          <pre className="test-cases-tab__service-cmd">
{`# from the repo root, in a terminal:
docker compose up --build pict-service`}
          </pre>
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
        <button
          type="button"
          className="test-cases-tab__generate"
          onClick={() => void onManualGenerate()}
          disabled={generating || dslHasErrors || source.length === 0}
        >
          {generating ? 'Generating…' : 'Re-generate'}
        </button>
        <span className="test-cases-tab__divider" aria-hidden="true" />
        <button
          type="button"
          className="test-cases-tab__copy-btn"
          onClick={() => void onCopy()}
          title="Copy as HTML table + TSV (paste-friendly to Excel and to plain-text editors)"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <span className="test-cases-tab__divider" aria-hidden="true" />
        <label className="test-cases-tab__format">
          Format:{' '}
          <select
            value={format}
            onChange={e => setFormat(e.target.value as 'csv' | 'json')}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <button
          type="button"
          className="test-cases-tab__download"
          onClick={() => void onDownload()}
          title="Download as a file (CSV / TSV / JSON)"
        >
          Download
        </button>
        <span className="test-cases-tab__divider" aria-hidden="true" />
        <button
          type="button"
          className="test-cases-tab__clear"
          onClick={() => useProjectStore.getState().setTestSuite(null)}
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
