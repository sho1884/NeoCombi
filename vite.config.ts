import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NeoCombi - Combinatorial Test Design Tool',
        short_name: 'NeoCombi',
        description:
          'Pairwise combinatorial test design with PICT integration. Modern reconstruction of PICT-PAPP.',
        theme_color: '#37474f',
        background_color: '#eceff1',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  define: {
    // Build-time JST timestamp displayed in the footer so users (and
    // bug-reporters) can identify exactly which build is running. Format:
    // "YYYY-MM-DDTHH:mm:ss" — the App slices to 16 chars and shows
    // "YYYY-MM-DD HH:mm".
    __BUILD_TIME__: JSON.stringify(
      new Date()
        .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
        .replace(' ', 'T'),
    ),
  },
})
