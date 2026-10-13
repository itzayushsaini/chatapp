import { expect, test } from '@playwright/test'

import { register } from './helpers.js'

async function setBanner(page, announcement) {
  await expect(async () => {
    const res = await page.request.patch('/api/admin/settings', { data: { announcement } })
    expect(res.ok()).toBe(true)
  }).toPass({ timeout: 10_000 })
}

test('an announcement shows on every page, labelled, and disappears when switched off', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const visitorContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const visitor = await visitorContext.newPage()
  await register(admin, 'admin_e2e_banner', 'Team PingMe')

  const text = 'Scheduled maintenance tonight from 11 PM to 11:30 PM.'
  await setBanner(admin, { enabled: true, text })

  await visitor.goto('/login')
  const banner = visitor.getByRole('status').filter({ hasText: text })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Announcement')

  await admin.reload()
  await expect(admin.getByRole('status').filter({ hasText: text })).toBeVisible()

  await setBanner(admin, { enabled: false })
  await expect(admin.getByRole('status').filter({ hasText: text })).toHaveCount(0)
  await visitor.reload()
  await expect(visitor.getByLabel('Username or email')).toBeVisible()
  await expect(visitor.getByRole('status').filter({ hasText: text })).toHaveCount(0)

  await adminContext.close()
  await visitorContext.close()
})
