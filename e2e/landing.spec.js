import { expect, test } from '@playwright/test'

import { register } from './helpers.js'

test('the home page explains PingMe and leads to sign up and log in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Real conversations')

  for (const name of [
    'Everything a chat app should do',
    'Three steps to your first chat',
    'Private by design. Secure by default.',
    'Questions, answered',
    'Ready to start chatting?',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeAttached()
  }

  await expect(page.getByText(/video call|voice call|end-to-end/i)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'PingMe AI, built in' })).toBeAttached()

  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/#privacy$/)
  await expect(page.getByRole('heading', { name: 'Private by design. Secure by default.' })).toBeInViewport()

  const answer = page.getByText('Messages start only after you accept it')
  await expect(answer).toBeHidden()
  await page.getByText('Can anyone message me?').click()
  await expect(answer).toBeVisible()

  await page.getByRole('link', { name: /Get started/ }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.getByRole('link', { name: 'PingMe home' }).click()
  await expect(page).toHaveURL(/\/$/)

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

  // overflow-x: clip hides overflow, so check every non-decorative element's edges instead
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

  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign up' })).toBeInViewport({ ratio: 1 })
  await context.close()
})

test('the home page follows dark mode', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('pingme:theme', 'dark'))
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // #0b141a, the dark theme's background
  await expect(page.locator('.landing-page')).toHaveCSS('background-color', 'rgb(11, 20, 26)')
  await context.close()
})
