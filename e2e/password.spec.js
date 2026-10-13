import { expect, test } from '@playwright/test'

import { PASSWORD, register } from './helpers.js'

test('requesting a password reset always shows the same message', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  // exact, or it can match the login page's "Username or email" during the route change
  await page.getByLabel('Email', { exact: true }).fill('nobody-at-all@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByText(/we've sent a link to reset your password/)).toBeVisible()

  await page.getByRole('link', { name: 'Back to log in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('a reset link missing its token shows an error, not a broken form', async ({ page }) => {
  await page.goto('/reset-password?email=someone@example.test')
  await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible()
})

test('changing your password from the profile logs out other devices, not this one', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await register(page, 'neha_pw', 'Neha')

  const otherDevice = await browser.newContext()
  const otherPage = await otherDevice.newPage()
  await otherPage.goto('/login')
  await otherPage.getByLabel('Username or email').fill('neha_pw')
  await otherPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await otherPage.getByRole('button', { name: 'Log in' }).click()
  await expect(otherPage.getByText('@neha_pw').first()).toBeVisible()

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your profile' })
  await dialog.getByLabel('Current password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('New password', { exact: true }).fill('a-new-password-456')
  await dialog.getByLabel('Confirm new password').fill('a-new-password-456')
  await dialog.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Your other devices have been logged out.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('@neha_pw').first()).toBeVisible()

  await otherPage.getByRole('tab', { name: 'Add Friend' }).click()
  await otherPage.getByLabel('Search by name or username').fill('someone')
  await otherPage.getByRole('button', { name: 'Search' }).click()
  await expect(otherPage).toHaveURL(/\/login$/)
  await expect(otherPage.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  await otherPage.getByLabel('Username or email').fill('neha_pw')
  await otherPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await otherPage.getByRole('button', { name: 'Log in' }).click()
  await expect(otherPage.getByText('Invalid credentials')).toBeVisible()

  await otherPage.getByLabel('Password', { exact: true }).fill('a-new-password-456')
  await otherPage.getByRole('button', { name: 'Log in' }).click()
  await expect(otherPage.getByText('@neha_pw').first()).toBeVisible()

  await context.close()
  await otherDevice.close()
})

test('changing your password rejects the wrong current password', async ({ page }) => {
  await register(page, 'rahul_pw', 'Rahul')

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your profile' })
  await dialog.getByLabel('Current password', { exact: true }).fill('totally-the-wrong-password')
  await dialog.getByLabel('New password', { exact: true }).fill('a-new-password-456')
  await dialog.getByLabel('Confirm new password').fill('a-new-password-456')
  await dialog.getByRole('button', { name: 'Update password' }).click()

  await expect(dialog.getByText('Current password is incorrect')).toBeVisible()
})
