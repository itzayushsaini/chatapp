import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

// Regression test: on a phone, opening the keyboard to type made the whole
// screen slide up, and the chat header (the friend's photo and name)
// disappeared off the top. Also: the announcement banner is not shown on
// phones (the team's decision).
//
// A real keyboard cannot be opened in an automated browser, so the test
// does what an iPhone keyboard does to the page: the VISIBLE area
// (window.visualViewport) becomes shorter, and the browser says so with a
// "resize" event. utils/viewport.js must then fit the chat into that area.

const PHONE = { viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true }

// Replaces window.visualViewport (before the app loads) with one the test
// controls: window.__keyboard(400) "opens" a keyboard leaving 400px visible,
// window.__keyboard(null) "closes" it.
async function fakeKeyboard(context) {
  await context.addInitScript(() => {
    const visible = new EventTarget()
    visible.scale = 1
    visible.height = window.innerHeight
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => visible })
    window.__keyboard = (height) => {
      visible.height = height ?? window.innerHeight
      visible.dispatchEvent(new Event('resize'))
    }
  })
}

test('with the phone keyboard open, the chat header and the newest message stay on screen', async ({ browser }) => {
  const sitaContext = await browser.newContext(PHONE)
  const raviContext = await browser.newContext(PHONE)
  await fakeKeyboard(sitaContext)
  const sita = await sitaContext.newPage()
  const ravi = await raviContext.newPage()
  await register(sita, 'sita_keyboard', 'Sita')
  await register(ravi, 'ravi_keyboard', 'Ravi Kumar')
  await befriend(sita, ravi, 'ravi_keyboard')

  // Enough messages that the list scrolls - tall ones, because sending is
  // limited to 10 messages per 5 seconds.
  await ravi.getByRole('button', { name: /Sita/ }).click()
  for (let i = 1; i <= 8; i++) {
    await ravi.getByLabel('Type a message').fill(`Message number ${i}\nsecond line\nthird line`)
    await ravi.getByLabel('Type a message').press('Enter')
  }

  await sita.getByRole('button', { name: /Ravi Kumar/ }).click()
  const log = sita.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('Message number 8')).toBeInViewport()
  await sita.getByLabel('Type a message').click()

  // The keyboard opens and covers all but the top 400px.
  await sita.evaluate(() => window.__keyboard(400))

  // The whole chat now fits in those 400px...
  const header = sita.getByRole('button', { name: /Ravi Kumar/ }).first()
  await expect.poll(async () => (await header.boundingBox()).y).toBeGreaterThanOrEqual(0)
  await expect(header).toBeInViewport()
  const box = await sita.getByLabel('Type a message').boundingBox()
  expect(box.y + box.height).toBeLessThanOrEqual(400)
  expect(await sita.evaluate(() => window.scrollY)).toBe(0)
  // ...and the newest message is still in view, above the text box.
  await expect(log.getByText('Message number 8')).toBeInViewport()

  // Keyboard closed: back to the full screen.
  await sita.evaluate(() => window.__keyboard(null))
  await expect.poll(() => sita.evaluate(() => document.documentElement.style.getPropertyValue('--app-height'))).toBe('')

  await sitaContext.close()
  await raviContext.close()
})

test('Android browsers are told to shrink the page for the keyboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/)
})

test('the announcement banner is shown on a computer, not on a phone', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await register(admin, 'admin_e2e_phbanner', 'Team PingMe')
  const text = 'Scheduled maintenance tonight from 11 PM.'
  await expect(async () => {
    const res = await admin.request.patch('/api/admin/settings', { data: { announcement: { enabled: true, text } } })
    expect(res.ok()).toBe(true)
  }).toPass({ timeout: 10_000 })

  const phoneContext = await browser.newContext(PHONE)
  const phone = await phoneContext.newPage()
  await phone.goto('/login')
  await expect(phone.getByLabel('Username or email')).toBeVisible()
  await expect(phone.getByText(text)).toBeHidden()

  await admin.goto('/login')
  await expect(admin.getByText(text)).toBeVisible()

  // Leave the shared test server as it was.
  await admin.request.patch('/api/admin/settings', { data: { announcement: { enabled: false } } })
  await adminContext.close()
  await phoneContext.close()
})
