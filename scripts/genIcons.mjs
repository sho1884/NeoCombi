#!/usr/bin/env node
// Rasterize SVG icons → PNGs for PWA install + Apple touch icon.
//
// Inputs:
//   public/favicon.svg          (desktop browser favicon, rounded bg)
//   public/icon-maskable.svg    (full-bleed bg for OS clipping)
//
// Outputs (committed under public/, served verbatim):
//   public/pwa-192x192.png            (non-maskable, from favicon.svg)
//   public/pwa-512x512.png            (non-maskable, from favicon.svg)
//   public/pwa-maskable-512x512.png   (maskable, from icon-maskable.svg)
//   public/apple-touch-icon.png       (180x180, iOS home-screen)
//
// Run after editing either SVG:
//   node scripts/genIcons.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = resolve(process.cwd())

async function render(svgPath, outPath, sizePx) {
  const svg = await readFile(resolve(root, svgPath), 'utf8')
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: sizePx },
    background: 'rgba(0,0,0,0)',
  })
  const png = r.render().asPng()
  await writeFile(resolve(root, outPath), png)
  process.stdout.write(`Wrote ${outPath} (${sizePx}x${sizePx}, ${png.length} bytes)\n`)
}

await render('public/favicon.svg', 'public/pwa-192x192.png', 192)
await render('public/favicon.svg', 'public/pwa-512x512.png', 512)
await render('public/icon-maskable.svg', 'public/pwa-maskable-512x512.png', 512)
await render('public/favicon.svg', 'public/apple-touch-icon.png', 180)
