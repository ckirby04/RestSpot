import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // PGlite (local dev backend) loads its WASM and extension bundles relative to
    // its own modules; pre-bundling would break those paths.
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-postgis'],
  },
})
