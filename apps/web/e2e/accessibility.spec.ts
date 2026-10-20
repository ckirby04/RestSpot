// Automated WCAG 2.1 AA checks (the proposal's accessibility requirement).
// axe catches a subset of issues; it complements, not replaces, manual testing.
import AxeBuilder from '@axe-core/playwright'
import { DEMO_ADMIN, DEMO_USER, expect, openRestroom, signIn, test, waitForApp, type Page } from './fixtures.ts'

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The map canvas is a visual duplicate of the results list.
    .exclude('.maplibregl-canvas')
    .analyze()
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  )
  expect(summary).toEqual([])
}

test.describe('accessibility', () => {
  test('search page', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('.result-card').first().waitFor()
    await page.getByRole('button', { name: /^Filters/ }).click()
    await expectNoViolations(page)
  })

  test('restroom page', async ({ page }) => {
    await openRestroom(page, 'Arkansas Union')
    await expectNoViolations(page)
  })

  test('add form', async ({ page }) => {
    await signIn(page, DEMO_USER)
    await page.getByRole('link', { name: 'Add a restroom' }).click()
    await page.getByRole('button', { name: '+ Men’s' }).click()
    await page.getByRole('button', { name: '+ Women’s' }).click()
    await expectNoViolations(page)
  })

  test('sign-in page', async ({ page }) => {
    await page.goto('/signin')
    await waitForApp(page)
    await expectNoViolations(page)
  })

  test('admin dashboard', async ({ page }) => {
    await signIn(page, DEMO_ADMIN)
    await page.goto('/dashboard/reports')
    await page.locator('.card').first().waitFor()
    await expectNoViolations(page)
  })

  test('keyboard users can skip to content', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  })
})
