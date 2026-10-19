import { DEMO_USER, expect, openRestroom, test } from './fixtures.ts'

test.describe('restroom details (guest)', () => {
  test('shows rooms, access, hours, and reviews', async ({ page }) => {
    await openRestroom(page, 'Arkansas Union')

    const rooms = page.getByRole('region', { name: 'Rooms', exact: true })
    await expect(rooms.getByRole('listitem')).toHaveCount(3)
    await expect(rooms).toContainText('Men’s · Multi-stall')
    await expect(rooms).toContainText('All-gender · Single-user')

    const access = page.getByRole('region', { name: 'Access', exact: true })
    await expect(access).toContainText('Open to the public')
    await expect(access).toContainText('Free')
    await expect(access).toContainText('second floor near the ballroom')

    await expect(page.getByRole('table', { name: 'Weekly hours' }).getByRole('row')).toHaveCount(7)
    await expect(page.getByText(/Verified · confirmed/)).toBeVisible()

    const reviews = page.getByRole('region', { name: 'Reviews', exact: true })
    await expect(reviews).toContainText('2 reviews')
    await expect(reviews).toContainText('Always clean, plenty of stalls.')
    // The admin's sample review was posted anonymously.
    await expect(reviews.getByText('Anonymous', { exact: true })).toBeVisible()
    await expect(reviews).not.toContainText('Demo Admin')
  })

  test('links to directions in a maps app', async ({ page }) => {
    await openRestroom(page, 'Arkansas Union')
    await expect(page.getByRole('link', { name: /Directions/ })).toHaveAttribute(
      'href',
      /google\.com\/maps\/dir\/.*destination=36\.068600,-94\.176000/,
    )
  })

  test('asks guests to sign in before contributing, then returns them', async ({ page }) => {
    await openRestroom(page, 'Arkansas Union')
    const url = page.url()

    await page.getByRole('button', { name: /Save/ }).click()
    await expect(page).toHaveURL(/\/signin$/)
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(url)
  })

  test('shows a not-found page for unknown listings', async ({ page }) => {
    await page.goto('/restroom/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('heading', { name: 'Restroom not found' })).toBeVisible({ timeout: 45_000 })
  })
})
