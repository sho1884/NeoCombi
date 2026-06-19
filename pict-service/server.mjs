// Minimal HTTP API in front of the PICT executable. Designed to run in the
// pict-service Docker container, but works just as well on a host that has
// PICT on PATH (set NEOCOMBI_PICT_PATH to override the binary location).
//
// Endpoints:
//   GET  /health                 health probe; returns the version PICT prints
//   POST /generate?order=N       body = DSL source text; response = TSV (text/tab-separated-values)
//   POST /decision-table         body = DSL source text; response = decision-table JSON
//                                (UR-009 / SR-105) — built-in core, no PICT
//
// The decision-table endpoint runs the same pure-TS core (generateDecisionTable)
// that the GUI and CLI use, bundled to ./core.mjs by `npm run build:pict-core`.
// PICT is not involved in that route.
//
// CORS is wide-open ('*') because this service is meant for local-only use
// alongside the NeoCombi GUI; do not expose it on a public network.

import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, generateDecisionTable } from './core.mjs'

const PORT = Number.parseInt(process.env['PORT'] ?? '8765', 10)
const PICT_PATH = process.env['NEOCOMBI_PICT_PATH'] ?? 'pict'
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2 MiB is plenty for a DSL file
const DEFAULT_ORDER = 2

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0
    const chunks = []
    req.on('data', chunk => {
      received += chunk.length
      if (received > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function probePict() {
  // PICT prints its banner on stderr when no input is given.
  const result = spawnSync(PICT_PATH, [], { encoding: 'utf8' })
  return {
    available: !result.error,
    version: (result.stderr || '').split('\n').find(l => l.length > 0) ?? '',
    path: PICT_PATH,
  }
}

function runPict(source, order) {
  const dir = mkdtempSync(join(tmpdir(), 'pict-svc-'))
  const inputFile = join(dir, 'model.txt')
  try {
    writeFileSync(inputFile, source, 'utf8')
    const result = spawnSync(PICT_PATH, [inputFile, `/o:${order}`], {
      encoding: 'utf8',
    })
    if (result.error) {
      const err = new Error(`Failed to launch PICT (${PICT_PATH}): ${result.error.message}`)
      err.cause = result.error
      err.kind = 'spawn-failed'
      throw err
    }
    if (result.status !== 0) {
      const err = new Error(`PICT exited with status ${result.status}`)
      err.kind = 'nonzero-exit'
      err.exitStatus = result.status
      err.stderr = result.stderr ?? ''
      throw err
    }
    return result.stdout ?? ''
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const server = http.createServer(async (req, res) => {
  applyCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url || '/', 'http://x')
  const path = url.pathname

  try {
    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true, ...probePict() })
      return
    }

    if (req.method === 'POST' && path === '/generate') {
      const orderRaw = url.searchParams.get('order')
      const order = orderRaw !== null ? Number.parseInt(orderRaw, 10) : DEFAULT_ORDER
      if (!Number.isFinite(order) || order < 1) {
        sendJson(res, 400, { error: `Invalid order: ${orderRaw}` })
        return
      }
      const source = await readBody(req)
      if (source.length === 0) {
        sendJson(res, 400, { error: 'Empty request body' })
        return
      }
      let stdout
      try {
        stdout = runPict(source, order)
      } catch (e) {
        const status = e.kind === 'spawn-failed' ? 502 : 500
        sendJson(res, status, {
          error: e.message,
          kind: e.kind,
          stderr: e.stderr ?? '',
        })
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/tab-separated-values; charset=utf-8' })
      res.end(stdout)
      return
    }

    if (req.method === 'POST' && path === '/decision-table') {
      const source = await readBody(req)
      if (source.length === 0) {
        sendJson(res, 400, { error: 'Empty request body' })
        return
      }
      const parsed = parse(source)
      const errors = parsed.diagnostics.filter(d => d.severity === 'error')
      if (errors.length > 0 || !parsed.model) {
        sendJson(res, 400, { reason: 'invalid-model', diagnostics: errors })
        return
      }
      const result = generateDecisionTable(parsed.model)
      if (!result.ok) {
        if (result.reason === 'too-large') {
          // 413 Payload Too Large is the apt status for "result would be too big".
          sendJson(res, 413, { reason: 'too-large', count: result.count, limit: result.limit })
        } else {
          sendJson(res, 400, { reason: 'invalid-model', diagnostics: result.diagnostics })
        }
        return
      }
      sendJson(res, 200, { columns: result.columns, rows: result.rows })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  } catch (e) {
    if (e?.status === 413) {
      sendJson(res, 413, { error: 'Request body too large' })
    } else {
      sendJson(res, 500, { error: e?.message ?? String(e) })
    }
  }
})

server.listen(PORT, () => {
  console.log(`pict-service listening on :${PORT} (pict at ${PICT_PATH})`)
})

// Graceful shutdown: SIGTERM on docker stop, SIGINT on Ctrl-C.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`received ${sig}, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  })
}
