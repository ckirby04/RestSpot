// Shared setup for end-to-end tests.
//
// Every test gets a fresh browser context, so IndexedDB and localStorage start
// empty and the app builds a fresh local database with the sample data.
// External services are stubbed so tests are fast and deterministic:
//   - map tiles/style (OpenFreeMap) → a blank style
//   - geocoding (Nominatim) → canned results
import { test as base, expect, type Page } from '@playwright/test'

/** Old Main, University of Arkansas — the sample data is around here. */
export const CAMPUS = { latitude: 36.0687, longitude: -94.1737 }

export const DEMO_USER = { email: 'demo@restspot.test', password: 'password123', name: 'Demo User' }
export const DEMO_ADMIN = { email: 'admin@restspot.test', password: 'password123', name: 'Demo Admin' }

const BLANK_STYLE = {
  version: 8,
  // Glyphs must be declared for the label layer; the requests themselves are aborted.
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0f2' } }],
}

export const GEOCODE_RESULTS = [
  {
    display_name:
      'Fayetteville Public Library, 401, West Mountain Street, Fayetteville, Washington County, Arkansas, 72701, United States',
    name: 'Fayetteville Public Library',
    lat: '36.0596',
    lon: '-94.1617',
    address: { city: 'Fayetteville' },
  },
]

async function stubNetwork(page: Page) {
  // Later routes take precedence, so the catch-all goes first.
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
  await page.route('https://tiles.openfreemap.org/styles/**', (route) => route.fulfill({ json: BLANK_STYLE }))
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ json: GEOCODE_RESULTS }))
}

/** Wait until the local database is up and the app has rendered. */
export async function waitForApp(page: Page) {
  await expect(page.locator('.splash')).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByRole('banner')).toBeVisible()
}

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/signin')
  await waitForApp(page)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: /^Dashboard/ })).toBeVisible()
}

/** Open a listing from the nearby results by name. */
export async function openRestroom(page: Page, name: string | RegExp) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('link', { name }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

export const test = base.extend({
  // Device location at campus, so the app searches nearby on first load.
  context: async ({ context }, use) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(CAMPUS)
    await use(context)
  },
  page: async ({ page }, use) => {
    await stubNetwork(page)
    // Accept window.confirm() prompts (delete, merge, rollback).
    page.on('dialog', (d) => void d.accept())
    await use(page)
  },
})

export { expect }
export type { Page }

/** Pins currently drawn on the map (reads the dev-only map handle). */
export async function mapPins(page: Page): Promise<{ id: string; name: string }[]> {
  return page.evaluate(async () => {
    const map = (window as unknown as { __restspotMap?: any }).__restspotMap
    const source = map?.getSource('restrooms')
    if (!source) return []
    const data = await source.getData()
    return data.features.map((f: any) => ({ id: f.properties.id, name: f.properties.name }))
  })
}

/** Screen position of a pin within the map canvas, for clicking it. */
export async function pinPosition(page: Page, name: string): Promise<{ x: number; y: number }> {
  return page.evaluate(async (pinName) => {
    const map = (window as unknown as { __restspotMap?: any }).__restspotMap
    const data = await map.getSource('restrooms').getData()
    const feature = data.features.find((f: any) => f.properties.name === pinName)
    const p = map.project(feature.geometry.coordinates)
    return { x: p.x, y: p.y }
  }, name)
}

/** Open a fresh, signed-in page in its own browser context (a second user). */
export async function pageAs(
  browser: import('@playwright/test').Browser,
  user: { email: string; password: string },
): Promise<Page> {
  const context = await browser.newContext({ permissions: ['geolocation'], geolocation: CAMPUS })
  const page = await context.newPage()
  await stubNetwork(page)
  page.on('dialog', (d) => void d.accept())
  await signIn(page, user)
  return page
}
