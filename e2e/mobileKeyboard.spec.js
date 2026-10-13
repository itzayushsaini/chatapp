import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

const PHONE = { viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true }

// a real keyboard can't be opened here, so fake visualViewport like iPhone Safari does:
// window.__keyboard(400) leaves 400px visible, window.__keyboard(null) closes it
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

  // tall messages, since sending is limited to 10 per 5 seconds
  await ravi.getByRole('button', { name: /Sita/ }).click()
  for (let i = 1; i <= 8; i++) {
    await ravi.getByLabel('Type a message').fill(`Message number ${i}\nsecond line\nthird line`)
    await ravi.getByLabel('Type a message').press('Enter')
  }

  await sita.getByRole('button', { name: /Ravi Kumar/ }).click()
  const log = sita.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('Message number 8')).toBeInViewport()
  await sita.getByLabel('Type a message').click()

  await sita.evaluate(() => window.__keyboard(400))

  const header = sita.getByRole('button', { name: /Ravi Kumar/ }).first()
  await expect.poll(async () => (await header.boundingBox()).y).toBeGreaterThanOrEqual(0)
  await expect(header).toBeInViewport()
  const box = await sita.getByLabel('Type a message').boundingBox()
  expect(box.y + box.height).toBeLessThanOrEqual(400)
  expect(await sita.evaluate(() => window.scrollY)).toBe(0)
  await expect(log.getByText('Message number 8')).toBeInViewport()

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

  await admin.request.patch('/api/admin/settings', { data: { announcement: { enabled: false } } })
  await adminContext.close()
  await phoneContext.close()
})
