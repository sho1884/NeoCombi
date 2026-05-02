import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { parseCsv } from '../services/csvImport'
import { generateTestCases } from '../services/pictApi'
import { formatTestSuite } from '../engines/pict'
import type { OutputFormat } from '../engines/pict'
import './TestCasesTab.css'

const AUTO_REGEN_DEBOUNCE_MS = 900

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestCaseExpected = useProjectStore(s => s.setTestCaseExpected)
  const source = useProjectStore(s => s.source)
  const pictOrder = useProjectStore(s => s.pictOrder)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)
  const parameterCount = useProjectStore(
    s => s.parseResult.model?.parameters.length ?? 0,
  )

  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [format, setFormat] = useState<OutputFormat>('csv')
  const [copied, setCopied] = useState(false)
  // Track the last generation we kicked off so debounced auto-regen can
  // skip if the source has not actually changed since.
  const lastGeneratedSource = useRef<string | null>(null)

  const dslHasErrors = diagnostics.some(d => d.severity === 'error')

  const runGenerate = async (reason: 'manual' | 'auto') => {
    // Always read latest source / order via getState() so the request reflects
    // edits made right up to the click — avoids stale-closure surprises.
    const state = useProjectStore.getState()
    const liveSource = state.source
    const liveOrder = state.pictOrder
    if (liveSource.length === 0) return
    if (state.parseResult.diagnostics.some(d => d.severity === 'error')) return
    if ((state.parseResult.model?.parameters.length ?? 0) < 1) return

    setGenerating(true)
    if (reason === 'manual') setError(null)
    try {
      const result = await generateTestCases(liveSource, { order: liveOrder })
      if (!result.ok) {
        if (result.error.kind === 'network') {
          setError(
            `Cannot reach the PICT service: ${result.error.message}. Start it with \`docker compose up pict-service\`.`,
          )
        } else if (result.error.kind === 'pict-error') {
          setError(
            `PICT rejected the model: ${result.error.message}` +
              (result.error.stderr ? ' — ' + result.error.stderr : ''),
          )
        } else {
          setError(`Service error (${result.error.status}): ${result.error.message}`)
        }
        return
      }
      const { suite } = parseCsv(result.value)
      if (suite.factorOrder.length === 0) {
        setError('PICT returned an empty result.')
        return
      }
      // Re-read the active store action in case the store mutated mid-flight.
      useProjectStore.getState().setTestSuite(suite)
      lastGeneratedSource.current = liveSource
      if (reason === 'manual') setError(null)
    } catch (e) {
      setError(`Unexpected error while generating: ${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  // Auto-regenerate when DSL source / order changes, debounced so a flurry of
  // edits in the editor only kicks off one request after the user pauses.
  // Only triggers when the model is parseable and has at least one parameter,
  // i.e. when there is something meaningful for PICT to chew on.
  useEffect(() => {
    if (dslHasErrors) return
    if (source.length === 0) return
    if (parameterCount === 0) return
    if (lastGeneratedSource.current === source) return

    const handle = window.setTimeout(() => {
      void runGenerate('auto')
    }, AUTO_REGEN_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [source, pictOrder, dslHasErrors, parameterCount])

  // ---------------------------------------------------------------------------
  // Export / copy actions (only meaningful when there is a suite to export)
  // ---------------------------------------------------------------------------

  const exportSuite = async (mode: 'copy' | 'download') => {
    if (!testSuite) return
    const text = formatTestSuite(testSuite, format)
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch {
        setError('Could not copy to clipboard.')
      }
      return
    }
    const ext = format === 'json' ? 'json' : format === 'tsv' ? 'tsv' : 'csv'
    const mime =
      format === 'json'
        ? 'application/json;charset=utf-8'
        : format === 'tsv'
          ? 'text/tab-separated-values;charset=utf-8'
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
            onClick={() => void runGenerate('manual')}
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
          onClick={() => void runGenerate('manual')}
          disabled={generating || dslHasErrors || source.length === 0}
        >
          {generating ? 'Generating…' : 'Re-generate'}
        </button>
        <span className="test-cases-tab__divider" aria-hidden="true" />
        <label className="test-cases-tab__format">
          Format:{' '}
          <select
            value={format}
            onChange={e => setFormat(e.target.value as OutputFormat)}
          >
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <button
          type="button"
          className="test-cases-tab__copy-btn"
          onClick={() => void exportSuite('copy')}
          title="Copy the rendered table to the clipboard"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="test-cases-tab__download"
          onClick={() => void exportSuite('download')}
          title="Download the rendered table as a file"
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
