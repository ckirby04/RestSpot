import { DEMO_USER, expect, signIn, test, waitForApp } from './fixtures.ts'

test.describe('accounts', () => {
  test('signs up, renames, signs out and back in, and deletes the account', async ({ page }) => {
    await page.goto('/signup')
    await waitForApp(page)
    await page.getByLabel('Display name').fill('Taylor Tester')
    await page.getByLabel('Email').fill('taylor@restspot.test')
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('At least 8 characters')

    await page.getByLabel('Password').fill('long-enough-1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('link', { name: /^Dashboard/ })).toBeVisible()

    await page.getByRole('link', { name: /^Dashboard/ }).click()
    await expect(page.getByRole('heading', { name: 'Hi, Taylor Tester' })).toBeVisible()
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByLabel('Display name').fill('Taylor T.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Hi, Taylor T.' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await signIn(page, { email: 'taylor@restspot.test', password: 'long-enough-1' })

    await page.goto('/dashboard/account')
    const deleteButton = page.getByRole('button', { name: 'Delete my account' })
    await expect(deleteButton).toBeDisabled()
    await page.getByLabel('Type DELETE to confirm').fill('DELETE')
    await deleteButton.click()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    // The account is gone.
    await page.goto('/signin')
    await page.getByLabel('Email').fill('taylor@restspot.test')
    await page.getByLabel('Password').fill('long-enough-1')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
  })

  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/signin')
    await waitForApp(page)
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
  })

  test('signs in with a provider', async ({ page }) => {
    await page.goto('/signin')
    await waitForApp(page)
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByRole('link', { name: /^Dashboard/ })).toBeVisible()
  })

  test('keeps the session across reloads', async ({ page }) => {
    await signIn(page, DEMO_USER)
    await page.reload()
    await waitForApp(page)
    await expect(page.getByRole('link', { name: /^Dashboard/ })).toBeVisible()
  })
})
