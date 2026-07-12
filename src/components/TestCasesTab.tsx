import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { runGenerate } from '../services/runGenerate'
import {
  checkPictApiHealth,
  DEFAULT_PICT_API_URL,
  type PictApiResult,
  type PictHealth,
} from '../services/pictApi'
import { runDecisionTable } from '../services/runDecisionTable'
import { formatTestSuite, testSuiteToHtml } from '../engines/pict'
import {
  formatDecisionTable,
  FORBIDDEN_MARK,
  type DecisionTableOutRow,
} from '../engines/dsl/formatDecisionTable'
import { copyTableToClipboard, escapeHtml } from '../services/clipboardWrite'
import { applyResultsCsv } from '../services/resultsCsv'
import { inspectTestSuite } from '../services/staleSet'
import { isHostedDeployment, isPictApiConfigured } from '../services/demoMode'
import { MASK_LEVEL } from '../engines/dsl/maskLevel'
import type { TestSuite } from '../types/testCase'
import './TestCasesTab.css'

/**
 * Reachability of the PICT service from this page, as far as the Test cases tab
 * has been able to tell. Drives the status banner and the empty-state copy so a
 * down / waking / missing service is never silently indistinguishable from
 * "you just haven't entered anything yet".
 */
type ServiceProbe =
  | { kind: 'idle' } // no service expected here (decision-table, or unconfigured hosted)
  | { kind: 'probing' } // health check in flight
  | { kind: 'starting' } // first probe timed out — likely a cold start, waiting it out
  | { kind: 'reachable' } // up, PICT available
  | { kind: 'no-pict' } // service up but PICT not usable on it
  | { kind: 'unreachable'; message: string } // down / errored / timed out

function probeFromHealth(r: PictApiResult<PictHealth>): ServiceProbe {
  if (r.ok) {
    return r.value.available === false ? { kind: 'no-pict' } : { kind: 'reachable' }
  }
  return { kind: 'unreachable', message: r.error.message }
}

/** A decision table is shown whenever its rows carry the forbidden flag. */
function isDecisionTable(suite: TestSuite | null): boolean {
  return suite?.rows.some(r => r.forbidden !== undefined) ?? false
}

/** Render a decision-table suite in the requested text format (id, count, forbidden, notes columns). */
function formatDecisionSuite(suite: TestSuite, format: 'csv' | 'json'): string {
  return formatDecisionTable(suite.factorOrder, decisionOutRows(suite), format)
}

function decisionOutRows(suite: TestSuite): DecisionTableOutRow[] {
  return suite.rows.map(r => {
    const values = suite.factorOrder.map(n => r.values[n] ?? '')
    const out: DecisionTableOutRow = { values, forbidden: r.forbidden ?? false }
    if (r.id !== undefined) out.id = r.id
    if (r.count !== undefined) out.count = r.count
    if (r.note !== undefined) out.note = r.note
    return out
  })
}

/**
 * HTML <table> for the clipboard that MATCHES the on-screen decision table:
 * a Forbidden column (same marker as CSV) plus Notes. Kept in step with the
 * plain-text payload so both clipboard flavours carry the same columns.
 */
function decisionSuiteToHtml(suite: TestSuite): string {
  const headers = ['ID', 'Count', ...suite.factorOrder, 'Forbidden', 'Notes']
  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const rowsHtml = decisionOutRows(suite)
    .map(row => {
      const cells = [
        row.id ?? '',
        row.count === undefined ? '' : String(row.count),
        ...row.values,
        row.forbidden ? FORBIDDEN_MARK : '',
        row.note ?? '',
      ]
      return '<tr>' + cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>'
    })
    .join('')
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`
}

/** SR-073 destructive-action guard: confirm before discarding flags / notes. */
function confirmDiscardFlagsNotes(action: string): boolean {
  if (!useProjectStore.getState().hasFlagsOrNotes()) return true
  return window.confirm(
    `${action} will discard the recorded count flags and notes on the current ` +
      `test set. This cannot be undone. Continue?`,
  )
}

export function TestCasesTab() {
  const testSuite = useProjectStore(s => s.testSuite)
  const setTestCaseNote = useProjectStore(s => s.setTestCaseNote)
  const setTestCaseCount = useProjectStore(s => s.setTestCaseCount)
  const source = useProjectStore(s => s.source)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)
  const generationMode = useProjectStore(s => s.generationMode)
  const setGenerationMode = useProjectStore(s => s.setGenerationMode)
  const model = useProjectStore(s => s.parseResult.model)

  const stale = useMemo(() => inspectTestSuite(testSuite, model), [testSuite, model])

  // Whether pairwise generation expects a reachable PICT service here. On a
  // hosted page with no service configured, the hostedBanner already explains
  // it, so we don't probe (the probe would hit the wrong URL anyway).
  const expectsService =
    generationMode === 'pairwise' && !(isHostedDeployment() && !isPictApiConfigured())

  // Reachability of the PICT service. `probeNonce` lets the Retry button re-run
  // the probe (e.g. after waking the service).
  const [probe, setProbe] = useState<ServiceProbe>({ kind: 'idle' })
  const [probeNonce, setProbeNonce] = useState(0)
  const retryProbe = () => setProbeNonce(n => n + 1)

  // Whether the remote service is a configured public one (vs. a local
  // docker-compose service). Picks the right "how to fix" wording.
  const remoteService = isPictApiConfigured()

  // When no service is expected here, treat the probe as idle regardless of any
  // value left over from a previous mode (the effect below skips probing, so it
  // won't overwrite it). Derived rather than set, to avoid a setState-in-effect.
  const effectiveProbe: ServiceProbe = expectsService ? probe : { kind: 'idle' }

  useEffect(() => {
    if (!expectsService) return
    let cancelled = false
    void (async () => {
      setProbe({ kind: 'probing' })
      // Fast first attempt. A slow-to-respond service (a network blip, or a
      // free-tier host cold-starting from scale-to-zero) won't answer in time,
      // so escalate to a visible "still waiting" state and give it longer
      // rather than declaring it down prematurely.
      let r = await checkPictApiHealth(DEFAULT_PICT_API_URL, { timeoutMs: 5000 })
      if (cancelled) return
      if (!r.ok && r.error.kind === 'network') {
        setProbe({ kind: 'starting' })
        r = await checkPictApiHealth(DEFAULT_PICT_API_URL, { timeoutMs: 60000 })
        if (cancelled) return
      }
      setProbe(probeFromHealth(r))
    })()
    return () => {
      cancelled = true
    }
  }, [expectsService, probeNonce])

  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [importInfo, setImportInfo] = useState<string | null>(null)
  // GUI exposes only the two formats engineers actually paste / commit:
  // CSV for code editors and test-automation tooling, JSON for parametrised
  // test runners. TSV stays available in the CLI for spreadsheet pipelines.
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [copied, setCopied] = useState(false)

  const dslHasErrors = diagnostics.some(d => d.severity === 'error')
  const showForbidden = isDecisionTable(testSuite)
  const forbiddenCount = testSuite?.rows.filter(r => r.forbidden).length ?? 0
  const uncountedCount =
    testSuite?.rows.filter(r => r.forbidden !== true && r.count === false).length ?? 0

  const onManualGenerate = async () => {
    // SR-073: regenerating reassigns IDs and drops flags / notes — confirm.
    if (!confirmDiscardFlagsNotes('Re-generating')) return
    setGenerating(true)
    setError(null)
    setImportInfo(null)
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
          setProbe({ kind: 'reachable' })
          break
        case 'skipped':
          setError(`Cannot generate: ${result.reason.replace('-', ' ')}`)
          break
        case 'network-error':
          setProbe({ kind: 'unreachable', message: result.message })
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

  const onChangeMode = (mode: 'pairwise' | 'decision-table') => {
    if (mode === generationMode) return
    // Both sets are kept (the store swaps active <-> stash), so switching loses
    // nothing and needs no guard. Re-generating within a mode is still guarded.
    setImportInfo(null)
    setError(null)
    setGenerationMode(mode)
  }

  const modeSelect = (
    <label className="test-cases-tab__format">
      Mode:{' '}
      <select
        value={generationMode}
        onChange={e => onChangeMode(e.target.value as 'pairwise' | 'decision-table')}
        title="Pairwise (PICT) vs full-combination decision table"
      >
        <option value="pairwise">Pairwise</option>
        <option value="decision-table">Decision table</option>
      </select>
    </label>
  )

  // Results write-back (SR-056): a three-column id,count,note CSV updates the
  // matching cases' flags and notes. Overwriting recorded values is guarded.
  const onImportResults = async (file: File) => {
    setError(null)
    setImportInfo(null)
    if (!confirmDiscardFlagsNotes('Importing results')) return
    const text = await file.text()
    const result = applyResultsCsv(text)

    // Hard failures get the error style with a specific reason, not a vague
    // "0 updated".
    if (result.warnings.some(w => w.reason.startsWith('header'))) {
      setError('Not a results CSV: the header row must have id, count, and note columns.')
      return
    }
    if (result.matched === 0 && result.unmatchedIds.length === 0 && result.warnings.length === 0) {
      setError('No data rows found in the file.')
      return
    }

    const parts = [`Updated ${result.matched} case${result.matched === 1 ? '' : 's'}`]
    if (result.unmatchedIds.length > 0) {
      const sample = result.unmatchedIds.slice(0, 5).join(', ')
      const more = result.unmatchedIds.length > 5 ? ', …' : ''
      parts.push(
        `${result.unmatchedIds.length} ID${result.unmatchedIds.length === 1 ? '' : 's'} matched no case (${sample}${more})`,
      )
    }
    if (result.warnings.length > 0) {
      // Surface the first concrete reason (e.g. "line 4: invalid count …").
      const w = result.warnings[0]!
      parts.push(
        `${result.warnings.length} row${result.warnings.length === 1 ? '' : 's'} skipped (line ${w.line}: ${w.reason})`,
      )
    }
    setImportInfo(parts.join('; ') + '.')
  }

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

  // The PICT service is expected here (local, or a configured remote). Report
  // its reachability explicitly — checking / waking / down / no-PICT — instead
  // of failing silently and leaving the neutral "no test cases" empty state.
  const decisionTableHint = (
    <>
      , or switch <strong>Mode</strong> to <strong>Decision table</strong> to
      generate in-browser (no PICT needed)
    </>
  )
  const serviceBanner = (() => {
    if (!expectsService) return null
    switch (effectiveProbe.kind) {
      case 'probing':
        return (
          <div className="test-cases-tab__hosted-banner" role="status">
            <strong>Checking the PICT service…</strong> at{' '}
            <code>{DEFAULT_PICT_API_URL}</code>
          </div>
        )
      case 'starting':
        return (
          <div className="test-cases-tab__hosted-banner" role="status">
            <strong>Still waiting on the PICT service…</strong> at{' '}
            <code>{DEFAULT_PICT_API_URL}</code> — it&apos;s taking longer than
            usual to respond (a sleeping free-tier host can need ~30–60s to wake).
            Hang on.
          </div>
        )
      case 'no-pict':
        return (
          <div className="test-cases-tab__stale-banner" role="alert">
            <strong>The PICT service is up but PICT isn&apos;t available on it</strong>{' '}
            (<code>{DEFAULT_PICT_API_URL}</code>). Pairwise can&apos;t run
            {decisionTableHint}.
          </div>
        )
      case 'unreachable':
        return (
          <div className="test-cases-tab__stale-banner" role="alert">
            <strong>Can&apos;t reach the PICT service</strong> at{' '}
            <code>{DEFAULT_PICT_API_URL}</code> — {effectiveProbe.message}.{' '}
            {remoteService ? (
              'It may be temporarily unavailable. '
            ) : (
              <>
                Start it (<code>docker compose up -d pict-service</code>).{' '}
              </>
            )}
            <button
              type="button"
              className="test-cases-tab__retry"
              onClick={retryProbe}
            >
              Retry
            </button>
            {decisionTableHint}.
          </div>
        )
      default:
        return null
    }
  })()

  if (!testSuite || testSuite.rows.length === 0) {
    return (
      <div className="test-cases-tab">
        {hostedBanner}
        {serviceBanner}
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
              : effectiveProbe.kind === 'unreachable' || effectiveProbe.kind === 'no-pict'
                ? 'Pairwise runs PICT on the service above, which isn’t reachable right now — see the notice above, or switch to Decision table.'
                : effectiveProbe.kind === 'probing' || effectiveProbe.kind === 'starting'
                  ? 'Pairwise runs PICT on the service above — confirming it’s reachable…'
                  : 'Pairwise mode runs PICT to produce a reduced covering set.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="test-cases-tab">
      {hostedBanner}
        {serviceBanner}
      <div className="test-cases-tab__toolbar">
        <span className="test-cases-tab__count">
          {testSuite.rows.length} {showForbidden ? 'combination' : 'test case'}
          {testSuite.rows.length === 1 ? '' : 's'},
          {' '}
          {testSuite.factorOrder.length} factor
          {testSuite.factorOrder.length === 1 ? '' : 's'}
          {showForbidden
            ? `, ${testSuite.rows.length - forbiddenCount} valid test case${
                testSuite.rows.length - forbiddenCount === 1 ? '' : 's'
              }, ${forbiddenCount} forbidden`
            : ''}
          {uncountedCount > 0 ? ` (${uncountedCount} not counted)` : ''}
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
        <label className="test-cases-tab__import-results" title="Write back a three-column id,count,note CSV (UR-010 / SR-056)">
          Import results…
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void onImportResults(f)
            }}
          />
        </label>
        <button
          type="button"
          className="test-cases-tab__clear"
          onClick={() => {
            if (!confirmDiscardFlagsNotes('Clearing the test set')) return
            setImportInfo(null)
            useProjectStore.getState().setTestSuite(null)
          }}
        >
          Clear
        </button>
        {importInfo ? <span className="test-cases-tab__import-info" role="status">{importInfo}</span> : null}
        {error ? <span className="test-cases-tab__error">{error}</span> : null}
      </div>

      {stale.stale ? (
        <div className="test-cases-tab__stale-banner" role="alert">
          <strong>This saved test set no longer matches the model.</strong>{' '}
          {stale.missingFactors.length > 0
            ? `Factor${stale.missingFactors.length === 1 ? '' : 's'} ${stale.missingFactors
                .map(f => `“${f}”`)
                .join(', ')} ${stale.missingFactors.length === 1 ? 'is' : 'are'} no longer in the DSL` +
              (stale.hasInvalidValues ? ', and some rows use levels that were removed or renamed.' : '.')
            : 'Some rows use levels that were removed or renamed.'}{' '}
          Coverage may be misleading — <strong>Re-generate</strong> to refresh the set (this
          discards the current flags / notes), or undo the DSL change.
        </div>
      ) : null}

      <div className="test-cases-tab__table-wrap">
        <table className="test-cases-tab__table">
          <thead>
            <tr>
              <th className="test-cases-tab__col-id" scope="col">ID</th>
              <th
                className="test-cases-tab__col-count"
                scope="col"
                title="Count toward coverage (UR-010): only checked cases contribute to the coverage matrix / rate"
              >
                Count
              </th>
              {showForbidden ? (
                <th className="test-cases-tab__col-forbidden" scope="col" title="Forbidden by a constraint">
                  Forbidden
                </th>
              ) : null}
              {testSuite.factorOrder.map(name => (
                <th key={`h-${name}`} scope="col">{name}</th>
              ))}
              <th className="test-cases-tab__col-notes" scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {testSuite.rows.map((row, idx) => (
              <tr
                key={`r-${idx}`}
                className={
                  (row.forbidden ? 'test-cases-tab__row--forbidden' : '') +
                  (row.count === false ? ' test-cases-tab__row--uncounted' : '')
                }
              >
                <th className="test-cases-tab__col-id" scope="row">{row.id ?? ''}</th>
                <td className="test-cases-tab__col-count">
                  {row.forbidden ? null : (
                    <input
                      type="checkbox"
                      checked={row.count !== false}
                      onChange={e => setTestCaseCount(idx, e.target.checked)}
                      aria-label={`Count case ${row.id ?? idx + 1} toward coverage`}
                    />
                  )}
                </td>
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
                <td className="test-cases-tab__col-notes">
                  <NotesCell
                    key={`note-${idx}-${row.note ?? ''}`}
                    initial={row.note ?? ''}
                    onCommit={value => setTestCaseNote(idx, value)}
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

type NotesCellProps = {
  initial: string
  onCommit: (value: string) => void
}

function NotesCell({ initial, onCommit }: NotesCellProps) {
  const [draft, setDraft] = useState(initial)

  const commit = () => {
    if (draft === initial) return
    onCommit(draft)
  }

  return (
    <input
      type="text"
      className="test-cases-tab__notes-input"
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
      placeholder="(no note)"
      aria-label="Note"
    />
  )
}
