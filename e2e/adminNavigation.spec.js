import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

// Regression test: with a chat open, going to the Admin panel and pressing
// its back arrow sometimes showed the full-page "Something went wrong".
// Leaving /admin re-mounts the chat layout, whose socket only exists from
// the SECOND render on - but the store still had that chat open with its
// messages loaded, so ChatWindow tried to mark it read on a null socket.
//
// The crash is purely client-side, so instead of making a real admin (which
// needs the database) we tell the browser it is one: /api/auth/me is
// answered with isAdmin: true. The admin panel's own API calls still get a
// 403 from the server, which does not matter here.
test('leaving the admin panel back to an open chat does not crash', async ({ browser }) => {
  const aman = await browser.newContext()
  const priya = await browser.newContext()
  const a = await aman.newPage()
  const p = await priya.newPage()
  await register(a, 'aman_adminnav', 'Aman Kumar')
  await register(p, 'priya_adminnav', 'Priya Sharma')
  await befriend(a, p, 'priya_adminnav')

  // A chat with a message in it, open on screen.
  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await a.getByLabel('Type a message').fill('hello before admin')
  await a.getByLabel('Type a message').press('Enter')
  const log = a.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('hello before admin')).toBeVisible()

  // From now on the browser believes this account is an admin.
  await a.route('**/api/auth/me', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ response, json: { user: { ...body.user, isAdmin: true } } })
  })
  await a.reload()
  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(log.getByText('hello before admin')).toBeVisible()

  // Several round trips, since the original bug was intermittent.
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
