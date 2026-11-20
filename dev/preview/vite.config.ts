import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The page drawn from fixtures, to look at a change (`bunx vite --config dev/preview/vite.config.ts
 * --port <port>`). No `serves()` and no `doors()`: it registers nothing and answers no host, so it
 * can run from any checkout beside the real module.
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../src') } },
  server: { host: '127.0.0.1', strictPort: true },
})
