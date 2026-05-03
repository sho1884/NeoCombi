#!/usr/bin/env node
// Build the static demo bundle that the hosted Vercel deployment loads
// when no PICT generator is reachable.
//
// Inputs:
//   examples/large-50.tmodel   (the demo fixture)
//   running pict-service       (default http://localhost:8765)
//
// Output:
//   public/demo/demo.json      { source, testSuite }
//
// Re-run after editing the fixture, the .tmodel grammar, or the
// TestSuite shape:
//   docker compose up --build pict-service     # in another shell
//   node scripts/genDemoBundle.mjs
//
// The PICT host can be overridden via PICT_API_URL.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PICT_URL = process.env.PICT_API_URL ?? 'http://localhost:8765'
const FIXTURE = 'examples/large-50.tmodel'
const OUT = 'public/demo/demo.json'

const root = resolve(process.cwd())
const tmodel = await readFile(resolve(root, FIXTURE), 'utf8')
// PICT itself does not understand `# @neocombi:` annotation lines; the
// service is plain PICT, so strip them before sending. The full .tmodel
// (with annotations) is what we ship in the bundle as the editor source.
const dslOnly = tmodel
  .split('\n')
  .filter(l => !l.startsWith('# @neocombi:'))
  .join('\n')

const res = await fetch(`${PICT_URL}/generate?order=2`, {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: dslOnly,
})
if (!res.ok) {
  const body = await res.text()
  throw new Error(`pict-service ${res.status}: ${body.slice(0, 200)}`)
}
const tsv = await res.text()
const lines = tsv.replace(/\r/g, '').split('\n').filter(l => l.length > 0)
const factorOrder = lines[0].split('\t')
const rows = lines.slice(1).map(line => {
  const parts = line.split('\t')
  const values = {}
  factorOrder.forEach((f, i) => {
    values[f] = parts[i] ?? ''
  })
  return { values }
})

const bundle = { source: tmodel, testSuite: { factorOrder, rows } }
await writeFile(resolve(root, OUT), JSON.stringify(bundle))
process.stdout.write(
  `Wrote ${OUT} — ${rows.length} cases × ${factorOrder.length} factors\n`,
)
