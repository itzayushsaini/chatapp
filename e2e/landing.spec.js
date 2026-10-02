import { expect, test } from '@playwright/test'

import { register } from './helpers.js'

// Phase 19: the public home page at "/" for anyone who is not logged in.

test('the home page explains PingMe and leads to sign up and log in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Real conversations')

  // Every section is there.
  for (const name of [
    'Everything a chat app should do',
    'Three steps to your first chat',
    'Private by design. Secure by default.',
    'Questions, answered',
    'Ready to start chatting?',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeAttached()
  }

  // It only claims what PingMe really does.
  await expect(page.getByText(/video call|voice call|end-to-end/i)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'PingMe AI, built in' })).toBeAttached()

  // The header links jump to their section.
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/#privacy$/)
  await expect(page.getByRole('heading', { name: 'Private by design. Secure by default.' })).toBeInViewport()

  // FAQ answers open and close with a click (native <details>).
  const answer = page.getByText('you need a friend’s exact username')
  await expect(answer).toBeHidden()
  await page.getByText('Why can I not search for people by name?').click()
  await expect(answer).toBeVisible()

  // "Get started" goes to sign up, and the logo there comes back home.
  await page.getByRole('link', { name: /Get started/ }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.getByRole('link', { name: 'PingMe home' }).click()
  await expect(page).toHaveURL(/\/$/)

  // "Log in" goes to the login form.
  await page.getByRole('link', { name: 'Log in' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('a logged-in user still gets the chat at "/", not the home page', async ({ page }) => {
  await register(page, 'meera_landing', 'Meera')
  await page.goto('/')
  await expect(page.getByText('@meera_landing').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Real conversations/ })).toHaveCount(0)
})

test('the home page fits a 320px phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // The page clips its decorations sideways (overflow-x: clip), so a plain
  // "is the page wider than the screen" check would miss real content being
  // cut off. Instead: no element outside the decorative (aria-hidden) parts
  // may reach past either edge.
  const tooWide = await page.evaluate(() => {
    const screen = document.documentElement.clientWidth
    return [...document.querySelectorAll('body *')]
      .filter((el) => !el.closest('[aria-hidden=true]') && !el.closest('.sr-only'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > screen + 1 || r.left < -1)
      })
      .map((el) => `${el.tagName} "${el.textContent.trim().slice(0, 30)}"`)
  })
  expect(tooWide).toEqual([])

  // The header's Log in / Sign up are reachable (the section links are
  // hidden on phones to make room).
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign up' })).toBeInViewport({ ratio: 1 })
  await context.close()
})

test('the home page follows dark mode', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('pingme:theme', 'dark'))
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The page's own background is the dark theme's (#0b141a), not white.
  await expect(page.locator('.landing-page')).toHaveCSS('background-color', 'rgb(11, 20, 26)')
  await context.close()
})
