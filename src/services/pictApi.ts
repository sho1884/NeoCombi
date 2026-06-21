// Client for the pict-service HTTP API (see pict-service/server.mjs).
// The API runs in a Docker container next to the GUI and exposes:
//
//   GET  /health                 health probe + PICT version
//   POST /generate?order=N       body = DSL source text; response = PICT TSV
//
// The default endpoint is http://localhost:8765 (matching docker-compose),
// overridable via the VITE_PICT_API_URL build-time env var.

const RAW_DEFAULT =
  (import.meta.env['VITE_PICT_API_URL'] as string | undefined) ??
  'http://localhost:8765'

export const DEFAULT_PICT_API_URL = RAW_DEFAULT.replace(/\/+$/, '')

export type PictHealth = {
  ok: boolean
  available: boolean
  version: string
  path: string
}

export type PictApiError =
  | { kind: 'network'; message: string }
  | { kind: 'service-error'; status: number; message: string; stderr?: string }
  | { kind: 'pict-error'; message: string; stderr?: string }

export type PictApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PictApiError }

/**
 * Probe the API. Returns the parsed JSON when the service responds 200,
 * otherwise an error describing the failure mode.
 *
 * The fetch is bounded by `timeoutMs` (default 6s). This matters: a sleeping or
 * crashed free-tier host often accepts the TCP/TLS connection but never sends an
 * HTTP response, so a fetch with no timeout hangs forever — and the caller can
 * never tell the service is down. With the timeout, that case surfaces as a
 * `network` error instead.
 */
export async function checkPictApiHealth(
  apiUrl: string = DEFAULT_PICT_API_URL,
  options: { timeoutMs?: number } = {},
): Promise<PictApiResult<PictHealth>> {
  const timeoutMs = options.timeoutMs ?? 6000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(joinUrl(apiUrl, '/health'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: 'service-error',
          status: response.status,
          message: `Health check returned HTTP ${response.status}`,
        },
      }
    }
    const json = (await response.json()) as PictHealth
    return { ok: true, value: json }
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'network', message: abortableMessage(e, controller, timeoutMs) },
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Send the DSL source to the API, asking PICT to generate test cases.
 * Returns the raw TSV body on success.
 */
export async function generateTestCases(
  source: string,
  options: { apiUrl?: string; order?: number; timeoutMs?: number } = {},
): Promise<PictApiResult<string>> {
  const apiUrl = (options.apiUrl ?? DEFAULT_PICT_API_URL).replace(/\/+$/, '')
  const order = options.order ?? 2
  // Generous bound: PICT itself is fast even at 100+ factors, so a long wait
  // means the service is wedged or cold-starting, not busy. Without it a wedged
  // host leaves the UI stuck on "Generating…" with no way out.
  const timeoutMs = options.timeoutMs ?? 120000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${apiUrl}/generate?order=${order}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: source,
      signal: controller.signal,
    })
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'network', message: abortableMessage(e, controller, timeoutMs) },
    }
  } finally {
    clearTimeout(timer)
  }

  if (response.ok) {
    const text = await response.text()
    return { ok: true, value: text }
  }

  // Try to parse the error JSON the service emits on 4xx / 5xx.
  type ErrorPayload = { error?: string; kind?: string; stderr?: string }
  let payload: ErrorPayload | null = null
  try {
    payload = (await response.json()) as ErrorPayload
  } catch {
    // fall through
  }
  if (payload?.kind === 'nonzero-exit') {
    return {
      ok: false,
      error: {
        kind: 'pict-error',
        message: payload.error ?? 'PICT failed',
        stderr: payload.stderr,
      },
    }
  }
  return {
    ok: false,
    error: {
      kind: 'service-error',
      status: response.status,
      message: payload?.error ?? `Service returned HTTP ${response.status}`,
      stderr: payload?.stderr,
    },
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * Message for a fetch that rejected. When we aborted it ourselves the raw
 * AbortError ("signal is aborted without reason") is useless to a user, so
 * translate that into a plain-language timeout instead.
 */
function abortableMessage(
  e: unknown,
  controller: AbortController,
  timeoutMs: number,
): string {
  if (controller.signal.aborted) {
    return `no response within ${Math.round(timeoutMs / 1000)}s (the service may be asleep or unreachable)`
  }
  return errorMessage(e)
}
