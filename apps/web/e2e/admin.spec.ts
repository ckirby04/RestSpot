import { DEMO_ADMIN, DEMO_USER, expect, openRestroom, pageAs, signIn, test } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await signIn(page, DEMO_ADMIN)
})

test.describe('administration', () => {
  test('is hidden from regular users', async ({ browser }) => {
    const user = await pageAs(browser, DEMO_USER)
    await expect(user.getByRole('link', { name: 'Reports' })).toHaveCount(0)
    await user.goto('/dashboard/reports')
    await expect(user).toHaveURL(/\/dashboard$/, { timeout: 45_000 })
    await openRestroom(user, 'Arkansas Union')
    await expect(user.getByRole('region', { name: 'Moderation' })).toHaveCount(0)
    await user.context().close()
  })

  test('resolves and reopens reports', async ({ page }) => {
    await page.goto('/dashboard/reports')
    const report = page.locator('.card').filter({ hasText: 'Wilson Park' })
    await expect(report).toContainText('Closed or no longer exists')
    await expect(report).toContainText('Reported by Demo User')

    await report.getByRole('button', { name: 'Mark resolved' }).click()
    await expect(page.getByText('No reports here.')).toBeVisible()

    await page.getByLabel('Show').selectOption('resolved')
    await page.locator('.card').filter({ hasText: 'Wilson Park' }).getByRole('button', { name: 'Reopen' }).click()
    await page.getByLabel('Show').selectOption('open')
    await expect(page.locator('.card').filter({ hasText: 'Wilson Park' })).toBeVisible()
  })

  test('suspends a user, who then cannot contribute', async ({ page }) => {
    await page.goto('/dashboard/users')
    const row = page.locator('.card').filter({ hasText: DEMO_USER.email })
    await row.getByLabel('Suspend for').selectOption({ label: '1 day' })
    await row.getByLabel('Reason').fill('Testing suspensions')
    await row.getByRole('button', { name: 'Suspend' }).click()
    await expect(row).toContainText('Suspended until')
    await expect(row).toContainText('Testing suspensions')

    // Admins can't suspend themselves.
    await expect(
      page.locator('.card').filter({ hasText: DEMO_ADMIN.email }).getByRole('button', { name: 'Suspend' }),
    ).toHaveCount(0)

    // Each browser context has its own local database, so check as the user in this one.
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, DEMO_USER)
    await page.getByRole('link', { name: /^Dashboard/ }).click()
    await expect(page.getByRole('alert')).toContainText('Your account is suspended')
    await page.getByRole('link', { name: 'Add a restroom' }).click()
    await expect(page.getByText('Your account is suspended')).toBeVisible()
  })

  test('merges a duplicate into another listing', async ({ page }) => {
    await openRestroom(page, 'Mullins Library')
    const moderation = page.getByRole('region', { name: 'Moderation' })
    const select = moderation.getByLabel('Merge this duplicate into')
    const option = select.locator('option', { hasText: 'Arkansas Union' })
    await select.selectOption({ label: (await option.textContent())! })
    await moderation.getByRole('button', { name: 'Merge' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arkansas Union')
    await page.getByRole('link', { name: '← All results' }).click()
    await expect(page.locator('.results')).toContainText('Arkansas Union')
    await expect(page.locator('.results')).not.toContainText('Mullins Library')
  })

  test('rolls a listing back to an earlier version', async ({ page }) => {
    await openRestroom(page, 'Wilson Park')
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByLabel(/Name of the place/).fill('Vandalized name')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vandalized name')

    await page.getByText('Edit history').click()
    const added = page.locator('.history li').filter({ hasText: 'Added by' })
    await added.getByRole('button', { name: /Restore this version/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wilson Park')
    await expect(page.locator('.history li').first()).toContainText('Rolled back')
  })

  test('hides and removes content', async ({ page }) => {
    await openRestroom(page, 'Arkansas Union')
    const review = page.locator('.review').filter({ hasText: 'Always clean' })
    await review.getByRole('button', { name: 'Hide (admin)' }).click()
    await expect(review).toContainText('Hidden by a moderator')
    await expect(page.getByRole('region', { name: 'Reviews', exact: true })).toContainText('1 review')

    await page.getByRole('button', { name: 'Remove listing' }).click()
    await expect(page.getByRole('note').filter({ hasText: 'removed by a moderator' })).toBeVisible()
    await page.getByRole('button', { name: 'Restore listing' }).click()
    await expect(page.getByRole('note').filter({ hasText: 'removed by a moderator' })).toHaveCount(0)
  })
})
