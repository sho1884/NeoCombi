/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest config kept separate from vite.config.ts so the production build
// (which is heavy on PWA / workbox plugins) doesn't drag those into the
// test runner. happy-dom backs the React component tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
