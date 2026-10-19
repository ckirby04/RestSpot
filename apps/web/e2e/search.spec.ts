import { expect, mapPins, pinPosition, test, waitForApp } from './fixtures.ts'

test.describe('finding restrooms', () => {
  test('shows nearby restrooms from the device location, in the list and on the map', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByText('Near Your location')).toBeVisible()

    const results = page.locator('.result-card')
    await expect(results.first()).toBeVisible()
    const count = await results.count()
    expect(count).toBeGreaterThan(5)
    await expect(page.getByRole('status').filter({ hasText: `${count} restrooms nearby` })).toBeVisible()

    // Sorted by distance: the library is closest to Old Main.
    await expect(results.first()).toContainText('Mullins Library')
    await expect.poll(async () => (await mapPins(page)).length).toBe(count)
  })

  test('filters by amenities', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const list = page.locator('.results')
    await expect(list).toContainText('Shell — Razorback Road')

    await page.getByRole('button', { name: /^Filters/ }).click()
    await page.getByRole('checkbox', { name: 'Changing table' }).check()
    await expect(list).not.toContainText('Shell — Razorback Road')
    await expect(list).toContainText('Fayetteville Public Library')
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible()

    await page.getByRole('checkbox', { name: 'Family room' }).check()
    await expect(list).toContainText('Fayetteville Public Library')
    await expect(list).not.toContainText('Mullins Library')

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(list).toContainText('Shell — Razorback Road')
  })

  test('limits results to the chosen radius', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const status = page.getByRole('status').filter({ hasText: /restrooms? nearby|No restrooms/ })
    await expect(status).toBeVisible()
    const wide = await page.locator('.result-card').count()

    await page.getByLabel('Within').selectOption('0.25')
    await expect.poll(() => page.locator('.result-card').count()).toBeLessThan(wide)
    await expect(page.locator('.results')).toContainText('Mullins Library')
    await expect(page.locator('.results')).not.toContainText('Walmart')
  })

  test('falls back to address search when location is denied', async ({ page, context }) => {
    await context.clearPermissions()
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByRole('alert').filter({ hasText: /Location access is off|location isn’t available/ })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Address or place' }).fill('Fayetteville Public Library')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByText('Near Fayetteville Public Library, Fayetteville')).toBeVisible()
    await expect(page.locator('.result-card').first()).toContainText('Fayetteville Public Library')
  })

  test('opens a restroom from its map pin', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect.poll(async () => (await mapPins(page)).length).toBeGreaterThan(0)

    const { x, y } = await pinPosition(page, 'Arkansas Union')
    await page.locator('.maplibregl-canvas').click({ position: { x, y } })
    await expect(page).toHaveURL(/\/restroom\//)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arkansas Union')
  })
})
