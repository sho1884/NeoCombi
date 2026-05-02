#!/usr/bin/env node
// NeoCombi CLI entry point — scaffold placeholder.
// Full implementation arrives with SR-080..082 (cli_mode category).
// See Doc/requirements/system_requirements.yaml.

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    [
      'neocombi — combinatorial test design tool',
      '',
      'Usage:',
      '  neocombi generate <input.tmodel>   (not yet implemented)',
      '',
      'Status: scaffold placeholder. Track progress at',
      '  https://github.com/sho1884/NeoCombi',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

process.stderr.write('NeoCombi CLI is not yet implemented (scaffold placeholder).\n')
process.stderr.write('Pass --help for available commands.\n')
process.exit(2)
