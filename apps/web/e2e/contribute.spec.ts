import { DEMO_USER, expect, mapPins, openRestroom, signIn, test, type Page } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await signIn(page, DEMO_USER)
})

async function fillNewRestroom(page: Page, name: string) {
  await page.getByRole('link', { name: 'Add a restroom' }).click()
  await page.getByLabel(/Name of the place/).fill(name)
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText(/Pin set at 36\.068/)).toBeVisible()
}

test.describe('contributing (signed in)', () => {
  test('saves a favorite and lists it on the dashboard', async ({ page }) => {
    await openRestroom(page, 'Mullins Library')
    await page.getByRole('button', { name: '☆ Save' }).click()
    await expect(page.getByRole('button', { name: '★ Saved' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('link', { name: /^Dashboard/ }).click()
    const saved = page.getByRole('region', { name: 'Saved restrooms' })
    await expect(saved.getByRole('link', { name: 'Mullins Library' })).toBeVisible()

    await saved.getByRole('button', { name: /Remove/ }).click()
    await expect(saved).toContainText('Nothing saved yet')
  })

  test('posts, edits, and deletes a review', async ({ page }) => {
    await openRestroom(page, 'Fayetteville Public Library')
    const reviews = page.getByRole('region', { name: 'Reviews', exact: true })
    await expect(reviews).toContainText('1 review')

    const form = page.locator('.review-form')
    await form.getByRole('group', { name: 'Overall' }).getByLabel('4 stars').check({ force: true })
    await form.getByRole('group', { name: 'Cleanliness' }).getByLabel('3 stars').check({ force: true })
    await form.getByLabel(/Comment/).fill('Clean family room, a bit busy.')
    await form.getByLabel(/Post anonymously/).check()
    await form.getByRole('button', { name: 'Post review' }).click()

    await expect(reviews).toContainText('2 reviews')
    const mine = reviews.locator('.review').filter({ hasText: 'You' })
    await expect(mine).toContainText('posted anonymously')
    await expect(mine).toContainText('Clean family room, a bit busy.')

    await mine.getByRole('button', { name: 'Edit' }).click()
    await page.locator('.review-form').getByLabel(/Comment/).fill('Updated: much quieter on weekdays.')
    await page.locator('.review-form').getByRole('button', { name: 'Update review' }).click()
    await expect(reviews).toContainText('Updated: much quieter on weekdays.')

    await reviews.locator('.review').filter({ hasText: 'You' }).getByRole('button', { name: 'Delete' }).click()
    await expect(reviews).toContainText('1 review')
    await expect(page.locator('.review-form')).toBeVisible()
  })

  test('files a report', async ({ page }) => {
    await openRestroom(page, 'Gregory Park')
    await page.getByRole('button', { name: 'Report a problem' }).click()
    const dialog = page.getByRole('dialog', { name: 'Report a problem' })
    await dialog.getByLabel('Information is wrong').check()
    await dialog.getByLabel(/Details/).fill('Restroom is on the north side, not south.')
    await dialog.getByRole('button', { name: 'Send report' }).click()
    await expect(dialog.getByRole('status')).toContainText('a moderator will review your report')
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })

  test('validates the add form', async ({ page }) => {
    await page.getByRole('link', { name: 'Add a restroom' }).click()
    await page.getByRole('button', { name: 'Add restroom' }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'Please fix the following' })
    // The location is pre-filled from the device, so it isn't flagged.
    await expect(summary).toContainText('Enter the name of the place.')
    await expect(summary).toContainText('Choose who can use the restroom.')
    await expect(summary).toContainText('Add at least one room.')
    await expect(summary).toBeFocused()
  })

  test('adds a restroom, then warns about duplicates nearby', async ({ page }) => {
    await fillNewRestroom(page, 'Old Main')
    await page.getByRole('group', { name: /Who can use it/ }).getByLabel('Public').check({ force: true })
    await page.getByRole('group', { name: 'Cost' }).getByLabel('Free').check({ force: true })
    await page.getByRole('button', { name: '+ Men’s' }).click()
    await page.getByRole('button', { name: '+ Women’s' }).click()

    // "For all rooms" sets both rooms at once.
    const allRooms = page.locator('.all-rooms')
    await allRooms.getByRole('group', { name: 'Wheelchair accessible' }).getByLabel('Yes').check({ force: true })
    await allRooms.getByRole('group', { name: 'Changing table' }).getByLabel('Yes').check({ force: true })

    await page.getByRole('button', { name: 'Open 24/7' }).click()
    await page.getByLabel(/Notes/).fill('First floor, east entrance.')
    await page.getByRole('button', { name: 'Add restroom' }).click()

    await expect(page).toHaveURL(/\/restroom\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Old Main')
    await expect(page.getByText('Open now')).toBeVisible()
    const rooms = page.getByRole('region', { name: 'Rooms', exact: true })
    await expect(rooms.locator('.amenity-yes')).toHaveCount(4)
    await expect.poll(async () => (await mapPins(page)).map((p) => p.name)).toContain('Old Main')

    // Starting a second listing with a similar name at the same spot warns about the first.
    await fillNewRestroom(page, 'old main hall')
    const warning = page.getByRole('status').filter({ hasText: 'Is this already listed?' })
    await expect(warning.getByRole('link', { name: 'Old Main' })).toBeVisible()
  })

  test('edits a listing and records it in the history', async ({ page }) => {
    await openRestroom(page, 'Gregory Park')
    await page.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Edit restroom' })).toBeVisible()
    await expect(page.getByLabel(/Name of the place/)).toHaveValue('Gregory Park')

    await page.getByLabel(/Name of the place/).fill('Gregory Park Pavilion')
    await page.getByRole('group', { name: 'Cost' }).getByLabel('Free').check({ force: true })
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gregory Park Pavilion')
    await page.getByText('Edit history').click()
    const history = page.locator('.history')
    await expect(history.getByRole('listitem').first()).toContainText('Edited by Demo User')
    await expect(history.getByRole('listitem').first()).toContainText('Changed: Name')
  })

  test('confirms a listing is accurate', async ({ page }) => {
    await openRestroom(page, 'Gregory Park')
    await expect(page.getByText(/^Unverified/)).toBeVisible()
    await page.getByRole('button', { name: 'Info is accurate' }).click()
    await expect(page.getByRole('button', { name: 'Thanks for confirming!' })).toBeDisabled()
    await expect(page.getByText(/Verified · confirmed today/)).toBeVisible()
  })

  test('lists my contributions', async ({ page }) => {
    await page.getByRole('link', { name: /^Dashboard/ }).click()
    await page.getByRole('link', { name: 'My contributions' }).click()
    await expect(page.getByRole('region', { name: 'My reviews' })).toContainText('Arkansas Union')
    await expect(page.getByRole('region', { name: 'My edits' })).toContainText('Added')
  })
})
