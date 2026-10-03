import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

// Regression test for the phone layout. On a small screen the chat used to
// be WIDER than the screen - a long friend name or a long link with no
// spaces stretched it - so its left part was cut off; Settings had the same
// problem; and a message's actions menu was drawn behind the bubbles below
// it, so its items could not be tapped.

// true when nothing inside `selector` is wider than the screen, and no
// scrolling box inside it hides content sideways.
function fitsScreen(page, selector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector)
    const screen = document.documentElement.clientWidth
    if (root.getBoundingClientRect().right > screen + 1) return false
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('[role=slider]')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 1 && r.right > screen + 1) return false
      const overflowX = getComputedStyle(el).overflowX
      if (/(auto|scroll)/.test(overflowX) && el.scrollWidth > el.clientWidth + 1) return false
    }
    return true
  }, selector)
}

test('a chat and Settings fit a 320px phone, and the message menu is on top', async ({ browser }) => {
  const options = { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }
  const ravi = await browser.newContext(options)
  const priya = await browser.newContext(options)
  const a = await ravi.newPage()
  const p = await priya.newPage()
  await register(a, 'ravi_mobile', 'Ravi Shankar')
  // The longest display name allowed is 40 characters.
  await register(p, 'priya_mobile', 'Priyanka Venkataraman Subramaniam Iyer')
  await befriend(a, p, 'priya_mobile')

  await a.getByRole('button', { name: /Priyanka/ }).click()
  const input = a.getByLabel('Type a message')
  await expect(input).toBeEnabled()
  for (const text of [
    'Hi!',
    'https://example.com/a/very/long/link/without/any/spaces/at/all/abcdefghijklmnopqrstuvwxyz0123456789',
    'One more message below the others',
  ]) {
    await input.fill(text)
    await input.press('Enter')
  }
  const log = a.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('One more message below the others')).toBeVisible()

  expect(await fitsScreen(a, 'section[aria-label^="Chat with"]')).toBe(true)

  // No hover on a touch screen, so the actions button must be visible.
  const actions = log
    .getByRole('listitem')
    .filter({ hasText: 'Hi!' })
    .getByRole('button', { name: 'Message actions' })
  await expect(actions).toBeVisible()
  await expect(actions).not.toHaveCSS('opacity', '0')

  // The first message's menu opens down over the later bubbles - its items
  // must be the thing actually under the finger, not a bubble on top.
  await actions.click()
  const reply = a.getByRole('menuitem', { name: 'Reply' })
  const box = await reply.boundingBox()
  const onTop = await a.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[role=menuitem]')?.textContent.trim(),
    [box.x + box.width / 2, box.y + box.height / 2],
  )
  expect(onTop).toBe('Reply')
  await reply.click()
  await expect(a.getByRole('button', { name: 'Cancel reply' })).toBeVisible()

  // Settings.
  await a.getByRole('button', { name: 'Back to chats' }).click()
  await a.getByRole('link', { name: 'Settings' }).click()
  await expect(a.getByRole('heading', { name: 'Settings' })).toBeVisible()
  expect(await fitsScreen(a, 'main')).toBe(true)
  await expect(a.getByRole('button', { name: 'Edit profile' })).toBeInViewport({ ratio: 1 })

  await ravi.close()
  await priya.close()
})

// The team asked for PingMe to look bigger on phones, like an app: below
// 768px the root text size is 112.5% (18px instead of 16px), and because
// every size in the app is in rem, everything grows together - including
// the message times, which used to be fixed pixel sizes. Computers keep 16px.
test('phones get the bigger size; computers keep the normal one', async ({ browser }) => {
  const px = (locator) => locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const sizes = async (page) => ({
    root: await px(page.locator('html')),
    input: await px(page.getByLabel('Type a message')),
    // The time inside the message bubble (MessageBubble's text-meta line).
    time: await px(
      page.getByRole('log', { name: 'Messages' }).getByRole('listitem').filter({ hasText: 'Hello from the computer' }).locator('.text-meta').first(),
    ),
  })

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  const deskContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const phone = await phoneContext.newPage()
  const desk = await deskContext.newPage()
  await register(phone, 'sita_bigger', 'Sita')
  await register(desk, 'ravi_bigger', 'Ravi Kumar')
  await befriend(phone, desk, 'ravi_bigger')

  await desk.getByRole('button', { name: /Sita/ }).click()
  await desk.getByLabel('Type a message').fill('Hello from the computer')
  await desk.getByLabel('Type a message').press('Enter')
  await phone.getByRole('button', { name: /Ravi Kumar/ }).click()
  await expect(phone.getByRole('log', { name: 'Messages' }).getByText('Hello from the computer')).toBeVisible()
  await expect(desk.getByRole('log', { name: 'Messages' }).getByText('Hello from the computer')).toBeVisible()

  const p = await sizes(phone)
  const d = await sizes(desk)
  expect(p.root).toBe(18)
  expect(d.root).toBe(16)
  // Everything scales by the same 18/16.
  expect(p.input / d.input).toBeCloseTo(18 / 16, 2)
  expect(p.time / d.time).toBeCloseTo(18 / 16, 2)

  await phoneContext.close()
  await deskContext.close()
})
