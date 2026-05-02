import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { parseCsv } from '../services/csvImport'
import { generateTestCases } from '../services/pictApi'
import './TestCasesTab.css'

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestSuite = useProjectStore(s => s.setTestSuite)
  const setTestCaseExpected = useProjectStore(s => s.setTestCaseExpected)
  const filePath = useProjectStore(s => s.filePath)
  const isDirty = useProjectStore(s => s.isDirty)
  const source = useProjectStore(s => s.source)
  const pictOrder = useProjectStore(s => s.pictOrder)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)

  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const dslHasErrors = diagnostics.some(d => d.severity === 'error')

  const onGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const result = await generateTestCases(source, { order: pictOrder })
      if (!result.ok) {
        if (result.error.kind === 'network') {
          setError(
            `Cannot reach the PICT service: ${result.error.message}. Start it with \`docker compose up pict-service\` (or run via the CLI as a fallback).`,
          )
        } else if (result.error.kind === 'pict-error') {
          setError(`PICT rejected the model: ${result.error.message}${result.error.stderr ? ' — ' + result.error.stderr : ''}`)
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
      setTestSuite(suite)
    } catch (e) {
      setError(`Unexpected error while generating: ${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  const onImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.tsv,text/csv,text/tab-separated-values,text/plain'
    input.style.display = 'none'
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input)
    }
    // Modern browsers fire 'cancel' when the picker is dismissed without
    // a selection. Without this, the hidden <input> would leak forever
    // because `change` never fires.
    input.addEventListener('cancel', cleanup)
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        const { suite, warnings, separator } = parseCsv(text)
        if (suite.factorOrder.length === 0) {
          setError('No header row found in the imported file.')
          return
        }
        setTestSuite(suite)
        const sepLabel = separator === '\t' ? 'TSV' : 'CSV'
        if (warnings.length > 0) {
          setError(
            `${warnings.length} row(s) had warnings; imported the rest as ${sepLabel}.`,
          )
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
    const projectName = filePath ?? 'YOUR_PROJECT.tmodel'
    const cliCommand = `node bin/neocombi.mjs generate ${projectName} --output cases.csv`

    const onCopy = async () => {
      try {
        await navigator.clipboard.writeText(cliCommand)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {
        setError('Could not copy to clipboard. Select the command manually.')
      }
    }

    return (
      <div className="test-cases-tab">
        <div className="test-cases-tab__toolbar">
          <button
            type="button"
            className="test-cases-tab__generate"
            onClick={onGenerate}
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
          <button type="button" className="test-cases-tab__import" onClick={onImport}>
            Import CSV…
          </button>
          {error ? <span className="test-cases-tab__error">{error}</span> : null}
        </div>
        <div className="test-cases-tab__no-suite">
          <h2 className="test-cases-tab__no-suite-title">
            No test cases yet
          </h2>
          <p className="test-cases-tab__no-suite-lede">
            Click <strong>Generate</strong> above to run PICT via the
            <code> pict-service </code>Docker container and populate the table.
            If the service is not running yet:
          </p>

          <pre className="test-cases-tab__service-cmd">
{`# from the repo root, in a terminal:
docker compose up --build pict-service`}
          </pre>

          <p className="test-cases-tab__no-suite-lede">
            Don&apos;t want Docker? You can fall back to the CLI workflow
            instead:
          </p>

          <ol className="test-cases-tab__steps">
            <li>
              <strong>Save your project</strong>{' '}
              {filePath ? (
                isDirty ? (
                  <span className="test-cases-tab__step-note">
                    (you have unsaved changes — click <em>Save</em> in the
                    header before running the command below)
                  </span>
                ) : (
                  <span className="test-cases-tab__step-note">
                    (saved as <code>{filePath}</code>)
                  </span>
                )
              ) : (
                <span className="test-cases-tab__step-note">
                  (use <em>Save As…</em> in the header)
                </span>
              )}
            </li>
            <li>
              <strong>Run the CLI</strong> in a terminal at the NeoCombi repo
              (PICT must be installed locally):
              <div className="test-cases-tab__command">
                <code>{cliCommand}</code>
                <button
                  type="button"
                  className="test-cases-tab__copy"
                  onClick={onCopy}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </li>
            <li>
              <strong>
                Click <em>Import CSV…</em> above
              </strong>{' '}
              and pick the <code>cases.csv</code> file.
            </li>
          </ol>
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
          onClick={onGenerate}
          disabled={generating || dslHasErrors || source.length === 0}
        >
          {generating ? 'Generating…' : 'Re-generate'}
        </button>
        <button type="button" className="test-cases-tab__import" onClick={onImport}>
          Import CSV…
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
