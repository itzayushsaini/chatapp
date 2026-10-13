import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

test('the login page has a brand panel on a wide screen and not on a phone', async ({ browser }) => {
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await wide.newPage()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Chat with the people')).toBeVisible()
  await expect(page.getByText('Private by design')).toBeVisible()
  await wide.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  const small = await phone.newPage()
  await small.goto('/login')
  await expect(small.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(small.getByText('Chat with the people')).toBeHidden()
  await phone.close()
})

test('a run of messages from one person sits together, and only its first bubble has the tail', async ({ browser }) => {
  const sitaContext = await browser.newContext()
  const raviContext = await browser.newContext()
  const sita = await sitaContext.newPage()
  const ravi = await raviContext.newPage()
  await register(sita, 'sita_group', 'Sita')
  await register(ravi, 'ravi_group', 'Ravi Kumar')
  await befriend(sita, ravi, 'ravi_group')

  const send = async (page, text) => {
    await page.getByLabel('Type a message').fill(text)
    await page.getByLabel('Type a message').press('Enter')
  }
  await sita.getByRole('button', { name: /Ravi Kumar/ }).click()
  await ravi.getByRole('button', { name: /Sita/ }).click()
  for (const text of ['one', 'two', 'three']) await send(sita, text)

  const log = ravi.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('three')).toBeVisible()
  await expect(log.locator('.bubble-tail-theirs')).toHaveCount(1)
  await expect(log.locator('.bubble-tail-theirs')).toContainText('one')
  await expect(log.getByRole('listitem').filter({ hasText: 'two' })).toHaveClass(/-mt-1/)
  await expect(log.getByRole('listitem').filter({ hasText: 'three' })).toHaveClass(/-mt-1/)
  await expect(log.getByRole('listitem').filter({ hasText: 'one' })).not.toHaveClass(/-mt-1/)

  await send(ravi, 'hello Sita')
  await expect(log.getByText('hello Sita')).toBeVisible()
  await expect(log.locator('.bubble-tail-mine')).toHaveCount(1)
  await send(sita, 'four')
  await expect(log.getByText('four')).toBeVisible()
  await expect(log.locator('.bubble-tail-theirs')).toHaveCount(2)

  await sitaContext.close()
  await raviContext.close()
})

test('scrolling a long chat shows the date for a moment; new messages do not', async ({ browser }) => {
  const sitaContext = await browser.newContext({ viewport: { width: 1280, height: 600 } })
  const raviContext = await browser.newContext()
  const sita = await sitaContext.newPage()
  const ravi = await raviContext.newPage()
  await register(sita, 'sita_daypill', 'Sita')
  await register(ravi, 'ravi_daypill', 'Ravi Kumar')
  await befriend(sita, ravi, 'ravi_daypill')

  // tall messages, since sending is limited to 10 per 5 seconds
  await ravi.getByRole('button', { name: /Sita/ }).click()
  for (let i = 1; i <= 8; i++) {
    await ravi.getByLabel('Type a message').fill(`Message ${i}\nsecond line\nthird line\nfourth line`)
    await ravi.getByLabel('Type a message').press('Enter')
  }
  await sita.getByRole('button', { name: /Ravi Kumar/ }).click()
  const log = sita.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('Message 8')).toBeInViewport()

  const pill = log.locator('xpath=..').locator('div[aria-hidden="true"] span', { hasText: 'Today' })
  await ravi.getByLabel('Type a message').fill('one more')
  await ravi.getByLabel('Type a message').press('Enter')
  await expect(log.getByText('one more')).toBeVisible()
  await expect(pill).toHaveCount(0)

  // wait out the 400 ms quiet window after a message, when scrolls are taken as auto-scroll
  await sita.waitForTimeout(700)
  await log.hover()
  await sita.mouse.wheel(0, -250)
  await expect(pill).toBeVisible()
  await expect(pill).toBeHidden({ timeout: 5000 })

  await sitaContext.close()
  await raviContext.close()
})

test('the admin dashboard: charts, sorting the user list, and the delete dialog', async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const admin = await adminContext.newPage()
  await register(admin, 'admin_e2e_dash', 'Team Dash')
  const others = []
  for (const [username, name] of [['zed_dash', 'Zed'], ['abe_dash', 'Abe']]) {
    const context = await browser.newContext()
    await register(await context.newPage(), username, name)
    others.push(context)
  }

  const adminLink = admin.getByRole('link', { name: 'Admin panel' })
  await expect(async () => {
    await admin.reload()
    await expect(adminLink).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await adminLink.click()

  await expect(admin.getByText('Total users')).toBeVisible()
  await expect(admin.getByRole('img', { name: /^New accounts: \d+ in the last 14 days/ })).toBeVisible()
  await expect(admin.getByRole('img', { name: /^Messages sent: \d+ in the last 14 days/ })).toBeVisible()
  await expect(admin.getByRole('img', { name: /^PingMe AI answers: \d+ in the last 14 days/ })).toBeVisible()
  const summary = await admin.getByRole('img', { name: /^New accounts:/ }).getAttribute('aria-label')
  expect(Number(summary.match(/: (\d+) in/)[1])).toBeGreaterThanOrEqual(3)
  await admin.getByRole('button', { name: '30 days' }).click()
  await expect(admin.getByRole('img', { name: /^New accounts: \d+ in the last 30 days/ })).toBeVisible()
  await expect(admin.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

  await admin.getByRole('tab', { name: 'Users' }).click()
  await admin.getByLabel('Search users').fill('_dash')
  await admin.getByRole('button', { name: 'Search' }).click()
  const rows = admin.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await admin.getByLabel('Sort').selectOption('name')
  await expect(rows.nth(0)).toContainText('Abe')
  await expect(rows.nth(1)).toContainText('Team Dash')
  await expect(rows.nth(2)).toContainText('Zed')
  await admin.getByLabel('Sort').selectOption('oldest')
  await expect(rows.nth(0)).toContainText('Team Dash')

  const zed = rows.filter({ hasText: 'Zed' })
  await zed.getByRole('button', { name: 'Delete' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Delete this account?' })
  await expect(dialog).toContainText('@zed_dash')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(rows).toHaveCount(3)
  await zed.getByRole('button', { name: 'Delete' }).click()
  await admin.getByRole('dialog', { name: 'Delete this account?' }).getByRole('button', { name: 'Delete account' }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Zed' })).toHaveCount(0)

  await adminContext.close()
  for (const context of others) await context.close()
})

test('the home page shows real screenshots with a light/dark switch, and a footer with links', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#screenshots')
  await section.scrollIntoViewIfNeeded()

  const laptopLight = page.getByRole('img', { name: /on a laptop in the light look/ })
  const laptopDark = page.getByRole('img', { name: /on a laptop in the dark look/ })
  await expect(laptopLight).toBeVisible()
  await expect(laptopDark).toBeHidden()
  await expect.poll(() => laptopLight.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)

  await section.getByRole('button', { name: 'dark', exact: true }).click()
  await expect(section.getByRole('button', { name: 'dark', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(laptopDark).toBeVisible()
  await expect(laptopLight).toBeHidden()
  await expect.poll(() => laptopDark.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)

  const footer = page.getByRole('contentinfo')
  await expect(footer.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  await expect(footer.getByRole('link', { name: 'Forgot password' })).toHaveAttribute('href', '/forgot-password')
  await expect(footer.getByRole('link', { name: /Report a problem/ })).toHaveAttribute('href', /github\.com\/.*\/issues$/)
})

test('the admin panel and the login panel layout fit a 320px phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  for (const route of ['/login', '/register', '/forgot-password', '/no/such/page']) {
    await page.goto(route)
    await page.waitForTimeout(300)
    expect(await sideways(), route).toBeLessThanOrEqual(0)
  }

  await register(page, 'admin_e2e_small', 'Small Admin')
  const adminLink = page.getByRole('link', { name: 'Admin panel' })
  await expect(async () => {
    await page.reload()
    await expect(adminLink).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await adminLink.click()
  for (const tab of ['Overview', 'Users', 'Updates', 'Settings']) {
    await page.getByRole('tab', { name: tab }).click()
    await page.waitForTimeout(500)
    expect(await sideways(), tab).toBeLessThanOrEqual(0)
  }
  await context.close()
})
