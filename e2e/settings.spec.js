import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme)

test('settings: dark theme is saved on the account, and Enter-to-send can be switched off', async ({ page }) => {
  await register(page, 'tara_e2e', 'Tara')
  expect(await theme(page)).toBe('light')

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  expect(await theme(page)).toBe('dark')

  // Saved on the server: a brand-new browser (no localStorage) logging in
  // as the same person gets it too.
  const other = await page.context().browser().newContext()
  const otherPage = await other.newPage()
  await otherPage.goto('/login')
  await otherPage.getByLabel('Username or email').fill('tara_e2e')
  await otherPage.getByLabel('Password', { exact: true }).fill('e2e-password-123')
  await otherPage.getByRole('button', { name: 'Log in' }).click()
  await expect(otherPage.getByText('@tara_e2e').first()).toBeVisible()
  await expect.poll(() => theme(otherPage)).toBe('dark')
  await other.close()

  // Enter to send: off -> Enter is just a new line.
  const enterSwitch = page.getByRole('switch', { name: /Enter to send/ })
  await expect(enterSwitch).toHaveAttribute('aria-checked', 'true')
  await enterSwitch.click()
  await expect(enterSwitch).toHaveAttribute('aria-checked', 'false')

  await page.getByRole('radio', { name: 'Light' }).click()
  expect(await theme(page)).toBe('light')

  await page.getByRole('link', { name: 'Back to chats' }).click()
  await expect(page.getByRole('tab', { name: 'Chats' })).toBeVisible()
})

test('contact info: shared media, mute, clear chat, and block / unblock', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_block', 'Aman Kumar')
  await register(priya, 'priya_block', 'Priya Sharma')
  await befriend(aman, priya, 'priya_block')

  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  await aman.getByLabel('Type a message').fill('hello priya')
  await aman.getByLabel('Type a message').press('Enter')
  const amanLog = aman.getByRole('log', { name: 'Messages' })
  await expect(amanLog.getByText('hello priya')).toBeVisible()

  // Priya opens the chat so the message is there for her too.
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  const priyaLog = priya.getByRole('log', { name: 'Messages' })
  await expect(priyaLog.getByText('hello priya')).toBeVisible()

  // --- Contact info panel -------------------------------------------------
  await aman.getByRole('heading', { name: 'Priya Sharma' }).getByRole('button').click()
  const info = aman.getByRole('complementary', { name: 'Contact info' })
  await expect(info.getByText('@priya_block')).toBeVisible()
  await expect(info.getByText('No photos or videos yet')).toBeVisible()

  // Mute: shown in the chat list.
  const mute = info.getByRole('switch', { name: /Mute notifications/ })
  await mute.click()
  await expect(mute).toHaveAttribute('aria-checked', 'true')
  await expect(aman.getByRole('button', { name: /Priya Sharma/ }).getByText('Muted')).toBeAttached()

  // Clear chat: gone for Aman, still there for Priya.
  await info.getByRole('button', { name: 'Clear chat' }).click()
  const clearDialog = aman.getByRole('dialog', { name: 'Clear this chat?' })
  await clearDialog.getByRole('button', { name: 'Clear chat' }).click()
  await expect(aman.getByText('Chat cleared')).toBeVisible()
  await expect(amanLog.getByText('hello priya')).toHaveCount(0)
  await priya.reload()
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  await expect(priyaLog.getByText('hello priya')).toBeVisible()

  // Block: the friendship ends on both sides, live.
  await info.getByRole('button', { name: 'Block Priya Sharma' }).click()
  await aman.getByRole('dialog', { name: 'Block Priya Sharma?' }).getByRole('button', { name: 'Block' }).click()
  await expect(aman.getByText('Priya Sharma is blocked')).toBeVisible()
  await expect(aman.getByRole('button', { name: /Priya Sharma/ })).toHaveCount(0)
  await expect(priya.getByRole('button', { name: /Aman Kumar/ })).toHaveCount(0)

  // Neither can find the other any more.
  await priya.getByRole('tab', { name: 'Add Friend' }).click()
  await priya.getByLabel('Find a friend by their exact username').fill('aman_block')
  await priya.getByRole('button', { name: 'Search' }).click()
  await expect(priya.getByText('No user found')).toBeVisible()

  // Unblock from Settings -> findable again.
  await aman.getByRole('link', { name: 'Settings' }).click()
  const privacy = aman.getByRole('region', { name: 'Privacy' })
  await expect(privacy.getByText('@priya_block')).toBeVisible()
  await privacy.getByRole('button', { name: 'Unblock Priya Sharma' }).click()
  await expect(privacy.getByText("You haven't blocked anyone.")).toBeVisible()

  await priya.getByRole('button', { name: 'Search' }).click()
  await expect(priya.getByRole('button', { name: 'Add friend' })).toBeVisible()

  await amanContext.close()
  await priyaContext.close()
})

test('messages keep arriving while Settings is open', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_live', 'Aman Kumar')
  await register(priya, 'priya_live', 'Priya Sharma')
  await befriend(aman, priya, 'priya_live')

  await aman.getByRole('link', { name: 'Settings' }).click()
  await expect(aman.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  await priya.getByLabel('Type a message').fill('are you there?')
  await priya.getByLabel('Type a message').press('Enter')

  // Same socket, still connected: the unread count reaches the tab title.
  await expect(aman).toHaveTitle('(1) PingMe')
  // And it is delivered (grey double tick), not just sent.
  await expect(priya.getByRole('log', { name: 'Messages' }).getByText('Delivered', { exact: true })).toBeVisible()

  await amanContext.close()
  await priyaContext.close()
})

test('the login page explains a failed Google sign-in', async ({ page }) => {
  await page.goto('/login?error=google_failed')
  await expect(page.getByRole('alert')).toHaveText("Google sign-in didn't work. Please try again.")
  // Not configured on the test server, so the button is not offered.
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0)
})
