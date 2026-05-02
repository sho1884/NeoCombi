#!/usr/bin/env node
// Bootstrap launcher for the NeoCombi CLI during development.
// Defers to tsx so src/cli.ts (TypeScript) can run without a build step.
// Production builds (post-MVP) will replace this with a built dist entry.

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cliEntry = resolve(here, '..', 'src', 'cli.ts')

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx/esm', cliEntry, ...process.argv.slice(2)],
  { stdio: 'inherit' },
)

process.exit(result.status ?? 1)
