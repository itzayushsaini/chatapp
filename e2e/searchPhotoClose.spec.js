import { expect, test } from '@playwright/test'

import { addProfilePhoto, befriend, PNG, register, searchFor } from './helpers.js'

// Three features added together: search by name, a required profile photo
// (with a reminder for older accounts), and closing the open chat.

test('search by name: everyone whose name matches is listed, each with the right button', async ({ browser }) => {
  const make = async (username, name) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await register(page, username, name)
    return { context, page }
  }
  const kavyaRao = await make('kr_namesearch', 'Kavya Rao')
  const kavyaIyer = await make('ki_namesearch', 'Kavya Iyer')
  const rohan = await make('rohan_namesearch', 'Rohan Mehta')
  const me = await make('me_namesearch', 'Arjun')

  // Part of a name, in any case: both Kavyas, not Rohan, never me.
  await searchFor(me.page, 'kAvYa', 'kr_namesearch')
  const results = me.page.getByRole('list', { name: 'Search results' }).getByRole('listitem')
  await expect(results.filter({ hasText: '_namesearch' })).toHaveCount(2)
  await expect(results.filter({ hasText: 'Kavya Rao' })).toHaveCount(1)
  await expect(results.filter({ hasText: 'Kavya Iyer' })).toHaveCount(1)
  await expect(results.filter({ hasText: 'Rohan Mehta' })).toHaveCount(0)

  // Send one a request from the list; the other row is untouched.
  const rao = results.filter({ hasText: '@kr_namesearch' })
  await rao.getByRole('button', { name: 'Add friend' }).click()
  await expect(rao.getByText('Requested ·')).toBeVisible()
  await expect(results.filter({ hasText: '@ki_namesearch' }).getByRole('button', { name: 'Add friend' })).toBeVisible()
  await expect(kavyaRao.page.getByText('Arjun sent you a friend request')).toBeVisible()

  // A surname works too.
  const mehta = await searchFor(me.page, 'mehta', 'rohan_namesearch')
  await expect(mehta).toContainText('Rohan Mehta')

  for (const p of [kavyaRao, kavyaIyer, rohan, me]) await p.context.close()
})

test('a new account must add a profile photo before using PingMe', async ({ page }) => {
  await register(page, 'nophoto_e2e', 'Meera', { photo: false })

  // The photo screen instead of the app - also after a reload.
  await expect(page.getByRole('heading', { name: 'Add your profile photo' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Chats' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Add your profile photo' })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Add your profile photo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

  // Choosing a photo opens the app, and it stays open after a reload.
  await page.goto('/')
  await addProfilePhoto(page)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Chats' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add your profile photo' })).toHaveCount(0)

  // It can be changed but not removed.
  await page.getByRole('button', { name: 'Edit your profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your profile' })
  await expect(dialog.getByRole('button', { name: 'Change photo' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove photo' })).toHaveCount(0)
  const res = await page.request.delete('/api/users/me/avatar')
  expect(res.status()).toBe(400)
})

test('an older account without a photo is reminded every time PingMe opens', async ({ page }) => {
  // "legacy_e2e..." accounts are turned into pre-photo-rule accounts by the
  // test server a moment after registering.
  await register(page, 'legacy_e2e_photo', 'Old Timer', { photo: false })
  const reminder = page.getByRole('dialog', { name: 'Add a profile photo' })
  await expect(async () => {
    await page.reload()
    await expect(reminder).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  // Not blocked: the app is there behind the popup. "Later" closes it...
  await page.getByRole('button', { name: 'Later' }).click()
  await expect(reminder).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Chats' })).toBeVisible()
  // ...only until next time.
  await page.reload()
  await expect(reminder).toBeVisible()

  // Adding a photo from the popup ends the reminders for good.
  await reminder.getByLabel('Choose a profile picture').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(reminder).toBeHidden()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Chats' })).toBeVisible()
  await expect(reminder).toHaveCount(0)
})

test('the open chat closes with the ✕ button or Escape, one step at a time', async ({ browser }) => {
  const aContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const bContext = await browser.newContext()
  const a = await aContext.newPage()
  const b = await bContext.newPage()
  await register(a, 'ana_close', 'Ana')
  await register(b, 'ben_close', 'Ben Thomas')
  await befriend(a, b, 'ben_close')

  const empty = a.getByRole('heading', { name: 'Select a conversation' })
  const chat = a.locator('section[aria-label^="Chat with"]')

  // The ✕ button.
  await a.getByRole('button', { name: /Ben Thomas/ }).click()
  await expect(a.getByLabel('Type a message')).toBeVisible()
  await a.getByRole('button', { name: 'Close chat' }).click()
  await expect(empty).toBeVisible()
  await expect(chat).toHaveCount(0)

  // Escape.
  await a.getByRole('button', { name: /Ben Thomas/ }).click()
  await a.getByLabel('Type a message').fill('hello Ben')
  await a.getByLabel('Type a message').press('Enter')
  const log = a.getByRole('log', { name: 'Messages' })
  await expect(log.getByText('hello Ben')).toBeVisible()

  // An open message menu takes the first Escape...
  const row = log.getByRole('listitem').filter({ hasText: 'hello Ben' })
  await row.hover()
  await row.getByRole('button', { name: 'Message actions' }).click()
  await expect(a.getByRole('menu')).toBeVisible()
  await a.keyboard.press('Escape')
  await expect(a.getByRole('menu')).toHaveCount(0)
  await expect(a.getByLabel('Type a message')).toBeVisible()

  // ...a reply in progress the next...
  await row.hover()
  await row.getByRole('button', { name: 'Message actions' }).click()
  await a.getByRole('menuitem', { name: 'Reply' }).click()
  await expect(a.getByRole('button', { name: 'Cancel reply' })).toBeVisible()
  await a.keyboard.press('Escape')
  await expect(a.getByRole('button', { name: 'Cancel reply' })).toHaveCount(0)
  await expect(a.getByLabel('Type a message')).toBeVisible()

  // ...and then the chat itself.
  await a.keyboard.press('Escape')
  await expect(empty).toBeVisible()

  // While it is closed, a new message is unread (it was not seen).
  await b.getByRole('button', { name: /Ana/ }).click()
  await b.getByLabel('Type a message').fill('are you there?')
  await b.getByLabel('Type a message').press('Enter')
  await expect(a.getByRole('button', { name: /Ben Thomas/ }).getByLabel(/unread/)).toBeVisible()

  // PingMe AI and the updates channel close the same way.
  await a.getByRole('button', { name: /^PingMe AI/ }).click()
  await expect(a.getByRole('heading', { name: 'PingMe AI' })).toBeVisible()
  await a.keyboard.press('Escape')
  await expect(empty).toBeVisible()
  await a.getByRole('button', { name: /PingMe \(official account\)/ }).click()
  await a.getByRole('button', { name: 'Close chat' }).click()
  await expect(empty).toBeVisible()

  await aContext.close()
  await bContext.close()
})
