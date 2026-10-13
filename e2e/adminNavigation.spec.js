import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

test('leaving the admin panel back to an open chat does not crash', async ({ browser }) => {
  const aman = await browser.newContext()
  const priya = await browser.newContext()
  const a = await aman.newPage()
  const p = await priya.newPage()
  await register(a, 'aman_adminnav', 'Aman Kumar')
  await register(p, 'priya_adminnav', 'Priya Sharma')
  await befriend(a, p, 'priya_adminnav')

  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await a.getByLabel('Type a message').fill('hello before admin')
  await a.getByLabel('Type a message').press('Enter')
  const log = a.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('hello before admin')).toBeVisible()

  // the crash is client-side, so faking isAdmin in /auth/me is enough (admin API calls still 403)
  await a.route('**/api/auth/me', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ response, json: { user: { ...body.user, isAdmin: true } } })
  })
  await a.reload()
  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(log.getByText('hello before admin')).toBeVisible()

  for (let i = 0; i < 3; i++) {
    await a.getByRole('link', { name: 'Admin panel' }).click()
    await expect(a).toHaveURL(/\/admin$/)
    await a.getByRole('link', { name: 'Back to chats' }).click()
    await expect(a).toHaveURL(/\/$/)
    await expect(log.getByText('hello before admin')).toBeVisible()
    await expect(a.getByText('Something went wrong')).toHaveCount(0)
  }

  await aman.close()
  await priya.close()
})
