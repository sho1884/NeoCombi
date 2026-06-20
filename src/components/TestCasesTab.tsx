import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { runGenerate } from '../services/runGenerate'
import { runDecisionTable } from '../services/runDecisionTable'
import { formatTestSuite, testSuiteToHtml } from '../engines/pict'
import {
  formatDecisionTable,
  FORBIDDEN_MARK,
  type DecisionTableOutRow,
} from '../engines/dsl/formatDecisionTable'
import { copyTableToClipboard, escapeHtml } from '../services/clipboardWrite'
import { isHostedDeployment, isPictApiConfigured } from '../services/demoMode'
import { MASK_LEVEL } from '../engines/dsl/maskLevel'
import type { TestSuite } from '../types/testCase'
import './TestCasesTab.css'

/** A decision table is shown whenever its rows carry the forbidden flag. */
function isDecisionTable(suite: TestSuite | null): boolean {
  return suite?.rows.some(r => r.forbidden !== undefined) ?? false
}

/** Render a decision-table suite in the requested text format (forbidden + expected columns). */
function formatDecisionSuite(suite: TestSuite, format: 'csv' | 'json'): string {
  return formatDecisionTable(suite.factorOrder, decisionOutRows(suite), format)
}

function decisionOutRows(suite: TestSuite): DecisionTableOutRow[] {
  return suite.rows.map(r => {
    const values = suite.factorOrder.map(n => r.values[n] ?? '')
    return r.expected !== undefined
      ? { values, forbidden: r.forbidden ?? false, expected: r.expected }
      : { values, forbidden: r.forbidden ?? false }
  })
}

/**
 * HTML <table> for the clipboard that MATCHES the on-screen decision table:
 * a Forbidden column (same marker as CSV) plus Expected. Kept in step with the
 * plain-text payload so both clipboard flavours carry the same columns.
 */
function decisionSuiteToHtml(suite: TestSuite): string {
  const headers = [...suite.factorOrder, 'Forbidden', 'Expected']
  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const rowsHtml = decisionOutRows(suite)
    .map(row => {
      const cells = [
        ...row.values,
        row.forbidden ? FORBIDDEN_MARK : '',
        row.expected ?? '',
      ]
      return '<tr>' + cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>'
    })
    .join('')
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`
}

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestCaseExpected = useProjectStore(s => s.setTestCaseExpected)
  const source = useProjectStore(s => s.source)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)
  const generationMode = useProjectStore(s => s.generationMode)
  const setGenerationMode = useProjectStore(s => s.setGenerationMode)

  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  // GUI exposes only the two formats engineers actually paste / commit:
  // CSV for code editors and test-automation tooling, JSON for parametrised
  // test runners. TSV stays available in the CLI for spreadsheet pipelines.
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [copied, setCopied] = useState(false)

  const dslHasErrors = diagnostics.some(d => d.severity === 'error')
  const showForbidden = isDecisionTable(testSuite)
  const forbiddenCount = testSuite?.rows.filter(r => r.forbidden).length ?? 0

  const onManualGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      if (generationMode === 'decision-table') {
        const result = runDecisionTable()
        switch (result.kind) {
          case 'ok':
            break
          case 'skipped':
            setError(`Cannot generate: ${result.reason.replace('-', ' ')}`)
            break
          case 'too-large':
            setError(
              `Too many combinations: ${result.count} exceeds the limit of ` +
                `${result.limit}. Reduce factors or levels, or use pairwise.`,
            )
            break
          case 'invalid-model':
            setError(`Invalid model: ${result.message}`)
            break
        }
        return
      }
      const result = await runGenerate()
      switch (result.kind) {
        case 'ok':
          break
        case 'skipped':
          setError(`Cannot generate: ${result.reason.replace('-', ' ')}`)
          break
        case 'network-error':
          setError(
            `Cannot reach the PICT generator. ${result.message}`,
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

  const modeSelect = (
    <label className="test-cases-tab__format">
      Mode:{' '}
      <select
        value={generationMode}
        onChange={e => setGenerationMode(e.target.value as 'pairwise' | 'decision-table')}
        title="Pairwise (PICT) vs full-combination decision table"
      >
        <option value="pairwise">Pairwise</option>
        <option value="decision-table">Decision table</option>
      </select>
    </label>
  )

  // ---------------------------------------------------------------------------
  // Export / copy actions (only meaningful when there is a suite to export)
  // ---------------------------------------------------------------------------

  const onCopy = async () => {
    if (!testSuite) return
    // Always copy BOTH text/html and text/plain. The user's format
    // selection drives the text/plain payload so VS Code / pytest /
    // automation tools see the format they actually want, while
    // Excel / Sheets keep working through the HTML path.
    const html = showForbidden
      ? decisionSuiteToHtml(testSuite)
      : testSuiteToHtml(testSuite)
    const plain = showForbidden
      ? formatDecisionSuite(testSuite, format)
      : formatTestSuite(testSuite, format)
    const result = await copyTableToClipboard(html, plain)
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
    const text = showForbidden
      ? formatDecisionSuite(testSuite, format)
      : formatTestSuite(testSuite, format)
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

  // Only worth a banner when there is something to act on: pairwise mode on a
  // hosted page with no PICT service configured. When generation just works
  // (decision-table in-browser, or pairwise with a configured service), say
  // nothing.
  const hostedBanner =
    isHostedDeployment() && generationMode !== 'decision-table' && !isPictApiConfigured() ? (
      <div className="test-cases-tab__hosted-banner" role="status">
        <strong>Pairwise needs a PICT service</strong>, which isn&apos;t
        configured here — switch Mode to <strong>Decision table</strong> to
        generate in-browser, or run NeoCombi locally (
        <a
          href="https://github.com/sho1884/NeoCombi#author-in-the-gui"
          target="_blank"
          rel="noopener noreferrer"
        >
          setup
        </a>
        ).
      </div>
    ) : null

  if (!testSuite || testSuite.rows.length === 0) {
    return (
      <div className="test-cases-tab">
        {hostedBanner}
        <div className="test-cases-tab__toolbar">
          {modeSelect}
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
                  : 'Generate test cases'
            }
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
          {error ? <span className="test-cases-tab__error">{error}</span> : null}
        </div>
        <div className="test-cases-tab__no-suite">
          <h2 className="test-cases-tab__no-suite-title">
            {generationMode === 'decision-table' ? 'No decision table yet' : 'No test cases yet'}
          </h2>
          <p className="test-cases-tab__no-suite-lede">
            Add factors and levels (DSL or Factors &amp; Levels tab); output is
            generated automatically once the DSL parses cleanly. Or click{' '}
            <strong>Generate</strong>.{' '}
            {generationMode === 'decision-table'
              ? 'Decision-table mode lists every combination in-browser (forbidden ones marked) — no PICT needed.'
              : 'Pairwise mode runs PICT to produce a reduced covering set.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="test-cases-tab">
      {hostedBanner}
      <div className="test-cases-tab__toolbar">
        <span className="test-cases-tab__count">
          {testSuite.rows.length} {showForbidden ? 'combination' : 'test case'}
          {testSuite.rows.length === 1 ? '' : 's'},
          {' '}
          {testSuite.factorOrder.length} factor
          {testSuite.factorOrder.length === 1 ? '' : 's'}
          {showForbidden ? ` (${forbiddenCount} forbidden)` : ''}
        </span>
        {modeSelect}
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
          title={
            showForbidden
              ? `Copy the decision table — HTML for Excel + ${format.toUpperCase()} text, both with the Forbidden column`
              : `Copy as an HTML table for Excel + ${format.toUpperCase()} text for plain-text editors`
          }
        >
          {copied ? 'Copied' : 'Copy'}
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
          title={
            showForbidden
              ? `Download the decision table as ${format.toUpperCase()} (includes the Forbidden column)`
              : `Download as ${format.toUpperCase()}`
          }
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
              {showForbidden ? (
                <th className="test-cases-tab__col-forbidden" scope="col" title="Forbidden by a constraint">
                  Forbidden
                </th>
              ) : null}
              {testSuite.factorOrder.map(name => (
                <th key={`h-${name}`} scope="col">{name}</th>
              ))}
              <th className="test-cases-tab__col-expected" scope="col">Expected</th>
            </tr>
          </thead>
          <tbody>
            {testSuite.rows.map((row, idx) => (
              <tr
                key={`r-${idx}`}
                className={row.forbidden ? 'test-cases-tab__row--forbidden' : undefined}
              >
                <th className="test-cases-tab__col-idx" scope="row">{idx + 1}</th>
                {showForbidden ? (
                  <td className="test-cases-tab__col-forbidden" aria-label={row.forbidden ? 'forbidden' : 'allowed'}>
                    {row.forbidden ? FORBIDDEN_MARK : ''}
                  </td>
                ) : null}
                {testSuite.factorOrder.map(name => {
                  const v = row.values[name] ?? ''
                  const isMask = v === MASK_LEVEL
                  return (
                    <td
                      key={`r-${idx}-${name}`}
                      className={
                        'test-cases-tab__cell' +
                        (isMask ? ' test-cases-tab__cell--mask' : '')
                      }
                      title={isMask ? 'Mask level' : undefined}
                    >
                      {v}
                    </td>
                  )
                })}
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
