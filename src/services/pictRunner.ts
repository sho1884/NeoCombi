// Node-side PICT runner. Spawns the external PICT executable, feeds the
// DSL source, and returns the captured stdout for downstream parsing.
// Browser code MUST NOT import this module — it depends on node:fs and
// node:child_process. See src/engines/pict for pure (browser-safe) helpers.

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type PictRunOptions = {
  /**
   * Path to the PICT executable. If omitted, the runner uses the
   * NEOCOMBI_PICT_PATH environment variable, falling back to the
   * literal "pict" (relying on PATH lookup).
   */
  pictPath?: string
  /** N-wise generation order. PICT default is 2 (pairwise). */
  order?: number
}

export type PictRunResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: 'spawn-failed' | 'nonzero-exit'; status: number | null; stderr: string; message: string }

const DEFAULT_PICT = 'pict'
const DEFAULT_ORDER = 2

/**
 * Run PICT against the given DSL source text and return its stdout.
 *
 * The DSL is written to a temporary file (PICT does not reliably read from
 * stdin across platforms). The temp file is removed before this function
 * returns even on error paths.
 */
export async function runPict(
  source: string,
  options: PictRunOptions = {},
): Promise<PictRunResult> {
  const pictPath =
    options.pictPath ?? process.env['NEOCOMBI_PICT_PATH'] ?? DEFAULT_PICT
  const order = options.order ?? DEFAULT_ORDER

  const dir = await mkdtemp(join(tmpdir(), 'neocombi-'))
  const inputFile = join(dir, 'model.txt')
  try {
    await writeFile(inputFile, source, 'utf8')
    const result = spawnSync(pictPath, [inputFile, `/o:${order}`], {
      encoding: 'utf8',
      shell: false,
    })
    if (result.error) {
      return {
        ok: false,
        reason: 'spawn-failed',
        status: null,
        stderr: '',
        message: `Failed to launch PICT (${pictPath}): ${result.error.message}. Set NEOCOMBI_PICT_PATH or pass --pict <path>.`,
      }
    }
    if (result.status !== 0) {
      return {
        ok: false,
        reason: 'nonzero-exit',
        status: result.status,
        stderr: result.stderr ?? '',
        message: `PICT exited with status ${result.status}.`,
      }
    }
    return { ok: true, stdout: result.stdout ?? '' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
