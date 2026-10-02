import { expect, test } from '@playwright/test'

import { PNG, register } from './helpers.js'

// The "PingMe" updates channel, end to end: a real admin posts from the
// Admin panel, and a user who is already online sees it arrive live.
// (start-server.js promotes accounts named "admin_e2e..." to admin.)

test('an admin posts an update; an online user sees it live, reads it, and cannot reply', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const userContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const user = await userContext.newPage()

  await register(admin, 'admin_e2e_updates', 'Team PingMe')
  await register(user, 'riya_updates', 'Riya')

  // The pinned row is there from the start, even with no friends and no posts.
  const row = user.getByRole('button', { name: /PingMe \(official account\)/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Official updates from the PingMe team')

  // The admin posts text + a photo from the Admin panel. The promotion
  // happens a moment after registering, and the browser only learns about
  // it from /auth/me - so reload until the Admin link appears.
  const adminLink = admin.getByRole('link', { name: 'Admin panel' })
  await expect(async () => {
    await admin.reload()
    await expect(adminLink).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await adminLink.click()
  await admin.getByRole('tab', { name: 'Updates' }).click()
  await admin.getByLabel('Update text').fill('New: voice notes are here 🎤')
  await admin.getByLabel('Choose a photo').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG })
  await admin.getByRole('button', { name: 'Post' }).click()
  await expect(admin.getByText('Posted - everyone can see it now.')).toBeVisible()
  await expect(admin.getByRole('listitem').filter({ hasText: 'New: voice notes are here 🎤' })).toBeVisible()

  // The user, already online, sees it arrive live: preview + unread badge.
  await expect(row).toContainText('📷 New: voice notes are here 🎤')
  await expect(row.getByLabel('1 unread')).toBeVisible()
  await expect(user).toHaveTitle('(1) PingMe')

  // Opening the channel shows the post, clears the badge - and there is no
  // message box, only the read-only note.
  await row.click()
  const channel = user.getByRole('region', { name: 'PingMe updates' })
  const log = channel.getByRole('log', { name: 'Updates' })
  await expect(log.getByText('New: voice notes are here 🎤')).toBeVisible()
  await expect(log.getByRole('button', { name: 'Open photo' }).locator('img')).toHaveJSProperty('complete', true)
  await expect(channel.getByText('Only PingMe can send messages here')).toBeVisible()
  await expect(user.getByLabel('Type a message')).toHaveCount(0)
  await expect(row.getByLabel(/unread/)).toHaveCount(0)
  await expect(user).toHaveTitle('PingMe')

  // Still read after a reload - the read pointer is saved on the server.
  await user.reload()
  await expect(user.getByRole('button', { name: /PingMe \(official account\)/ })).toBeVisible()
  await expect(user.getByRole('button', { name: /PingMe \(official account\)/ }).getByLabel(/unread/)).toHaveCount(0)

  // Deleting it removes it live from the user's chat list.
  admin.once('dialog', (dialog) => dialog.accept())
  await admin.getByRole('button', { name: 'Delete update' }).click()
  await expect(admin.getByText('Nothing posted yet.')).toBeVisible()
  await expect(user.getByRole('button', { name: /PingMe \(official account\)/ })).toContainText(
    'Official updates from the PingMe team',
  )

  await adminContext.close()
  await userContext.close()
})

test('a user who is not an admin has no way to post', async ({ page }) => {
  await register(page, 'kabir_updates', 'Kabir')
  await expect(page.getByRole('link', { name: 'Admin panel' })).toHaveCount(0)
  const res = await page.request.post('/api/admin/updates', { data: { text: 'sneaky' } })
  expect(res.status()).toBe(403)
})
