import { expect, test } from '@playwright/test'

import { PASSWORD, register } from './helpers.js'

// Each browser "context" is a separate, isolated browser profile with its own
// cookies - so two contexts are two different people on two computers.

test('a logged-out visitor is sent to /login, and unknown routes go home', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/some/unknown/page')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('two people find each other, become friends and chat in real time', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_e2e', 'Aman Kumar')
  await register(priya, 'priya_e2e', 'Priya Sharma')

  // Empty state shows my own username to share.
  await expect(aman.getByText('No friends yet')).toBeVisible()

  // --- Search is exact-match only ---------------------------------------
  await aman.getByRole('tab', { name: 'Add Friend' }).click()
  const search = aman.getByLabel('Find a friend by their exact username')

  await search.fill('priya')
  await aman.getByRole('button', { name: 'Search' }).click()
  await expect(aman.getByText('No user found')).toBeVisible()

  await search.fill('PRIYA_E2E')
  await aman.getByRole('button', { name: 'Search' }).click()
  await expect(aman.getByText('Priya Sharma')).toBeVisible()

  // --- Friend request, delivered live -----------------------------------
  await aman.getByRole('button', { name: 'Add friend' }).click()
  await expect(aman.getByText('Requested ·')).toBeVisible()

  await expect(priya.getByText('Aman Kumar sent you a friend request')).toBeVisible()
  await expect(priya.getByLabel('1 incoming')).toBeVisible()

  await priya.getByRole('tab', { name: /Requests/ }).click()
  await priya.getByRole('button', { name: 'Accept' }).click()

  await expect(aman.getByText('Priya Sharma accepted your friend request')).toBeVisible()
  await expect(aman.getByRole('button', { name: 'Message' })).toBeVisible()

  // --- Chat --------------------------------------------------------------
  await aman.getByRole('button', { name: 'Message' }).click()
  await expect(aman.getByRole('heading', { name: 'Priya Sharma' })).toBeVisible()
  const amanChat = aman.getByRole('region', { name: 'Chat with Priya Sharma' })
  await expect(amanChat.getByText('Online', { exact: true })).toBeVisible()

  const amanInput = aman.getByLabel('Type a message')
  await amanInput.fill('Hello <b>Priya</b>')
  await amanInput.press('Enter')

  // Rendered as text, never as HTML.
  const amanLog = aman.getByRole('log', { name: 'Messages' })
  await expect(amanLog.getByText('Hello <b>Priya</b>')).toBeVisible()
  // Priya is online, so it reaches her app at once: grey double tick.
  await expect(amanLog.getByText('Delivered', { exact: true })).toBeVisible()

  // Priya sees an unread badge and the preview, then opens the chat.
  await priya.getByRole('tab', { name: 'Chats' }).click()
  await expect(priya.getByLabel('1 unread')).toBeVisible()
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  const priyaLog = priya.getByRole('log', { name: 'Messages' })
  await expect(priyaLog.getByText('Hello <b>Priya</b>')).toBeVisible()

  const priyaInput = priya.getByLabel('Type a message')
  await priyaInput.fill('Hi Aman!')
  await priyaInput.press('Enter')
  await expect(amanLog.getByText('Hi Aman!')).toBeVisible()

  // --- The session and history survive a refresh ------------------------
  await aman.reload()
  await expect(aman.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0)
  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(amanLog.getByText('Hi Aman!')).toBeVisible()
  await expect(amanLog.getByText('Hello <b>Priya</b>')).toBeVisible()

  // --- Presence: Priya leaves --------------------------------------------
  await priyaContext.close()
  await expect(amanChat.getByText(/Last seen today/)).toBeVisible()

  await amanContext.close()
})

test('switching between two chats never shows the other chat\'s messages, and only the message list scrolls', async ({ page }) => {
  const aman = page
  const rahul = await (await page.context().browser().newContext()).newPage()
  const priya = await (await page.context().browser().newContext()).newPage()
  await register(aman, 'aman_switch', 'Aman Kumar')
  await register(rahul, 'rahul_switch', 'Rahul Singh')
  await register(priya, 'priya_switch', 'Priya Sharma')

  for (const [friend, username] of [[rahul, 'rahul_switch'], [priya, 'priya_switch']]) {
    await aman.getByRole('tab', { name: 'Add Friend' }).click()
    await aman.getByLabel('Find a friend by their exact username').fill(username)
    await aman.getByRole('button', { name: 'Search' }).click()
    await aman.getByRole('button', { name: 'Add friend' }).click()
    await friend.getByRole('tab', { name: /Requests/ }).click()
    await friend.getByRole('button', { name: 'Accept' }).click()
    await aman.getByRole('tab', { name: 'Chats' }).click()
  }

  // Chat A has enough messages to be taller than the viewport. The composer
  // is disabled until history has loaded, so wait for it to be usable first -
  // typing into it earlier would silently do nothing.
  await aman.getByRole('button', { name: /Rahul Singh/ }).click()
  const amanLog = aman.getByRole('log', { name: 'Messages' })
  const amanInput2 = aman.getByLabel('Type a message')
  await expect(amanInput2).toBeEnabled()
  for (let i = 1; i <= 8; i++) {
    await amanInput2.fill(`Rahul message ${i}`)
    await amanInput2.press('Enter')
    await amanLog.getByText(`Rahul message ${i}`, { exact: true }).waitFor()
  }

  // Chat B - open it and send its own, distinct message.
  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(amanInput2).toBeEnabled()
  await amanInput2.fill('Priya message')
  await amanInput2.press('Enter')
  await amanLog.getByText('Priya message').waitFor()

  // Switching back and forth must always show the RIGHT chat's content -
  // never the previous one's - and the page itself must never scroll (only
  // the message list, inside its own fixed-height panel, does).
  await aman.getByRole('button', { name: /Rahul Singh/ }).click()
  await expect(amanLog.getByText('Rahul message 1')).toBeVisible()
  await expect(amanLog.getByText('Priya message')).toHaveCount(0)

  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(amanLog.getByText('Priya message')).toBeVisible()
  await expect(amanLog.getByText('Rahul message 1')).toHaveCount(0)

  const overflow = await aman.evaluate(() => ({
    bodyScrollHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
  }))
  expect(overflow.bodyScrollHeight).toBeLessThanOrEqual(overflow.innerHeight)
})

test('logging out ends the session', async ({ page }) => {
  await register(page, 'rahul_e2e', 'Rahul')

  await page.getByRole('button', { name: 'Log out' }).click()
  // It asks first - cancelling keeps you logged in.
  const confirm = page.getByRole('dialog', { name: 'Log out?' })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('@rahul_e2e').first()).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await confirm.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // The cookie is gone: going back to the app redirects to login again.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  // And logging back in works.
  await page.getByLabel('Username or email').fill('rahul_e2e')
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('@rahul_e2e').first()).toBeVisible()
})
