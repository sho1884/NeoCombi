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
// This service runs untrusted DSL through the native PICT binary with NO
// authentication (the NeoCombi/NeoCEG APIs are public by design). The only
// defenses are guardrails, all configurable via env so local dev stays open
// while a public deployment can lock down:
//   ALLOWED_ORIGINS    comma-separated CORS allowlist, or '*' (default '*')
//   PICT_TIMEOUT_MS    kill a PICT run that exceeds this (default 10000)
//   MAX_ORDER          reject /generate order above this (default 6)
//   RATE_LIMIT_PER_MIN per-IP requests/min on work endpoints, 0=off (default 60)
//   MAX_BODY_BYTES     request body cap (default 2 MiB)

import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, generateDecisionTable } from './core.mjs'

const PORT = Number.parseInt(process.env['PORT'] ?? '8765', 10)
const PICT_PATH = process.env['NEOCOMBI_PICT_PATH'] ?? 'pict'
const MAX_BODY_BYTES = Number.parseInt(process.env['MAX_BODY_BYTES'] ?? String(2 * 1024 * 1024), 10)
const DEFAULT_ORDER = 2
const PICT_TIMEOUT_MS = Number.parseInt(process.env['PICT_TIMEOUT_MS'] ?? '10000', 10)
const MAX_ORDER = Number.parseInt(process.env['MAX_ORDER'] ?? '6', 10)
const RATE_LIMIT_PER_MIN = Number.parseInt(process.env['RATE_LIMIT_PER_MIN'] ?? '60', 10)
const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

function applyCors(res, origin) {
  if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

// Fixed-window per-IP rate limiter. In-memory: adequate for a single-instance
// demo (deploy with a small max-instances). Not shared across instances.
const rateWindows = new Map()
function rateLimited(ip) {
  if (RATE_LIMIT_PER_MIN <= 0) return false
  const now = Date.now()
  let w = rateWindows.get(ip)
  if (!w || now > w.resetAt) {
    w = { count: 0, resetAt: now + 60_000 }
    rateWindows.set(ip, w)
  }
  w.count += 1
  // Opportunistic cleanup so the map can't grow without bound.
  if (rateWindows.size > 10_000) {
    for (const [k, v] of rateWindows) if (now > v.resetAt) rateWindows.delete(k)
  }
  return w.count > RATE_LIMIT_PER_MIN
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
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
      timeout: PICT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024 * 1024,
    })
    // A timed-out child surfaces as error.code ETIMEDOUT or signal SIGKILL.
    if ((result.error && result.error.code === 'ETIMEDOUT') || result.signal === 'SIGKILL') {
      const err = new Error(`PICT timed out after ${PICT_TIMEOUT_MS} ms`)
      err.kind = 'timeout'
      throw err
    }
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
  applyCors(res, req.headers.origin)
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

    // Rate-limit the work endpoints (the unauthenticated public surface).
    if (req.method === 'POST' && (path === '/generate' || path === '/decision-table')) {
      if (rateLimited(clientIp(req))) {
        sendJson(res, 429, { error: 'Rate limit exceeded; try again shortly' })
        return
      }
    }

    if (req.method === 'POST' && path === '/generate') {
      const orderRaw = url.searchParams.get('order')
      const order = orderRaw !== null ? Number.parseInt(orderRaw, 10) : DEFAULT_ORDER
      if (!Number.isFinite(order) || order < 1) {
        sendJson(res, 400, { error: `Invalid order: ${orderRaw}` })
        return
      }
      if (order > MAX_ORDER) {
        sendJson(res, 400, { error: `Order ${order} exceeds the maximum (${MAX_ORDER})` })
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
        const status =
          e.kind === 'spawn-failed' ? 502 : e.kind === 'timeout' ? 504 : 500
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
