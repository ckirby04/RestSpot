import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run the real app against the in-browser PGlite backend
// (no Supabase keys), so they need nothing but the dev server.
const PORT = 5180

export default defineConfig({
  testDir: './e2e',
  // Each test boots its own Postgres in the browser (~3–5 s), so allow some headroom.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the local backend even if a developer has Supabase keys in .env.local.
    env: { VITE_BACKEND: 'local' },
  },
})
