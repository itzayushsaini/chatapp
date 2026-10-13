import { expect, test } from '@playwright/test'

import { PNG, befriend, imageLoaded, register } from './helpers.js'

const aiRow = (page) => page.getByRole('button', { name: /^PingMe AI/ })
const aiChat = (page) => page.getByRole('region', { name: 'PingMe AI', exact: true })
const aiLog = (page) => page.getByRole('log', { name: 'Chat with PingMe AI' })

// wait until the previous answer is saved (Stop button gone), or the server answers 409
async function ask(page, text) {
  await expect(page.getByRole('button', { name: 'Stop answering' })).toHaveCount(0)
  await page.getByLabel('Ask PingMe AI').fill(text)
  await page.getByLabel('Ask PingMe AI').press('Enter')
}

test('ask PingMe AI: the answer streams in with reasoning and formatting, and it remembers the chat', async ({ page }) => {
  await register(page, 'riya_ai', 'Riya')

  await expect(aiRow(page)).toContainText('Ask me anything')
  await aiRow(page).click()
  await expect(aiChat(page).getByText("Hi! I'm PingMe AI")).toBeVisible()
  await expect(aiChat(page).getByText(/goes to Google to get an answer/)).toBeVisible()

  await aiChat(page).getByRole('button', { name: 'Explain recursion with a simple example' }).click()
  const log = aiLog(page)
  await expect(log.getByText('You asked: "Explain recursion with a simple example"')).toBeVisible()
  await expect(log.locator('strong', { hasText: 'three tips' })).toBeVisible()
  // the message list is an <ol> itself, so this is the list inside the answer
  await expect(log.locator('ol ol > li', { hasText: 'Take short breaks' })).toBeVisible()
  await expect(log.getByRole('cell', { name: 'Monday' })).toBeVisible()

  await expect(log.getByText('Reading the question')).toHaveCount(0)
  await log.getByRole('button', { name: 'Show reasoning' }).click()
  await expect(log.locator('strong', { hasText: 'Reading the question' })).toBeVisible()
  await log.getByRole('button', { name: 'Hide reasoning' }).click()

  await ask(page, 'What did I just ask?')
  await expect(log.getByText('I remember 2 earlier messages.')).toBeVisible()

  await page.getByRole('button', { name: 'Think deeper' }).click()
  await expect(page.getByRole('button', { name: 'Think deeper' })).toHaveAttribute('aria-pressed', 'true')
  await ask(page, 'Plan my exam week')
  await expect(log.getByRole('listitem').filter({ hasText: 'Think deeper' }).filter({ hasText: 'Plan my exam week' })).toBeVisible()
  await expect(log.getByText('You asked: "Plan my exam week"')).toBeVisible()

  await page.reload()
  await expect(aiRow(page)).toContainText('You asked: "Plan my exam week"')
  await aiRow(page).click()
  await expect(aiLog(page).getByText('What did I just ask?', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 375, height: 740 })
  await expect(aiLog(page).getByRole('cell', { name: 'Monday' }).first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('Stop, a failed answer with Try again, and clearing the chat', async ({ page }) => {
  await register(page, 'aman_ai', 'Aman')
  await aiRow(page).click()
  const log = aiLog(page)

  await ask(page, 'Tell me a slow story')
  await expect(log.getByText(/Once upon/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop answering' }).click()
  await expect(log.getByText('You stopped this answer.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop answering' })).toHaveCount(0)

  await ask(page, 'Please fail once')
  await expect(log.getByText('PingMe AI is busy right now - please try again in a minute.')).toBeVisible()
  await log.getByRole('button', { name: 'Try again' }).click()
  await expect(log.getByText('You asked: "Please fail once"')).toBeVisible()
  await expect(log.getByText(/PingMe AI is busy right now/)).toHaveCount(0)

  await aiChat(page).getByRole('button', { name: 'Clear chat' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Clear chat' }).click()
  await expect(aiChat(page).getByText("Hi! I'm PingMe AI")).toBeVisible()
  await page.reload()
  await aiRow(page).click()
  await expect(aiChat(page).getByText("Hi! I'm PingMe AI")).toBeVisible()
})

test('a photo, and a message forwarded from a friend chat', async ({ browser }) => {
  const riyaContext = await browser.newContext()
  const kabirContext = await browser.newContext()
  const riya = await riyaContext.newPage()
  const kabir = await kabirContext.newPage()
  await register(riya, 'riya_ai_files', 'Riya')
  await register(kabir, 'kabir_ai_files', 'Kabir')
  await befriend(riya, kabir, 'kabir_ai_files')

  await aiRow(riya).click()
  await riya.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG })
  await ask(riya, 'What is written here?')
  const log = aiLog(riya)
  await expect(log.getByText('I can see your file: image/png.')).toBeVisible()
  await expect.poll(() => imageLoaded(log.getByRole('button', { name: 'Open photo board.png' }).locator('img'))).toBe(true)
  await expect(riya.getByRole('button', { name: 'Stop answering' })).toHaveCount(0)

  await kabir.getByRole('button', { name: /Riya/ }).click()
  await kabir.getByLabel('Type a message').fill('Is the DBMS exam on Friday?')
  await kabir.getByLabel('Type a message').press('Enter')

  await riya.getByRole('button', { name: /Kabir/ }).click()
  // scoped to the message list: Kabir's chat-list row previews the same text
  const bubble = riya.getByRole('log', { name: 'Messages' }).getByRole('listitem').filter({ hasText: 'Is the DBMS exam on Friday?' })
  await bubble.hover()
  await bubble.getByRole('button', { name: 'Message actions' }).click()
  await riya.getByRole('menuitem', { name: 'Forward' }).click()
  await riya.getByRole('dialog').getByLabel(/PingMe AI/).check()
  await riya.getByRole('dialog').getByRole('button', { name: 'Forward (1)' }).click()
  await expect(riya.getByText('Message forwarded')).toBeVisible()

  await aiRow(riya).click()
  await expect(log.getByRole('listitem').filter({ hasText: 'Forwarded' }).filter({ hasText: 'Is the DBMS exam on Friday?' })).toBeVisible()
  await expect(log.getByText('You asked: "Is the DBMS exam on Friday?"')).toBeVisible()

  await riyaContext.close()
  await kabirContext.close()
})

test('"Imagine" appears only once an admin switches picture creation on', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const userContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const user = await userContext.newPage()
  await register(admin, 'admin_e2e_ai', 'Team PingMe')
  await register(user, 'meera_ai', 'Meera')

  await aiRow(user).click()
  await expect(user.getByRole('button', { name: 'Think deeper' })).toBeVisible()
  await expect(user.getByRole('button', { name: 'Imagine' })).toHaveCount(0)

  const adminLink = admin.getByRole('link', { name: 'Admin panel' })
  await expect(async () => {
    await admin.reload()
    await expect(adminLink).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await adminLink.click()
  await admin.getByRole('tab', { name: 'Settings' }).click()
  await admin.getByLabel('Creating pictures ("Imagine")').check()
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.getByText('Saved.')).toBeVisible()

  await user.reload()
  await aiRow(user).click()
  await user.getByRole('button', { name: 'Imagine' }).click()
  await expect(user.getByLabel('Ask PingMe AI')).toHaveAttribute('placeholder', 'Describe the picture you want...')
  await ask(user, 'a small green square')
  const log = aiLog(user)
  await expect(log.getByText('Here is your picture!')).toBeVisible()
  await expect.poll(() => imageLoaded(log.getByRole('button', { name: /Open photo pingme-ai/ }).locator('img'))).toBe(true)

  await admin.getByLabel('Creating pictures ("Imagine")').uncheck()
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.getByText('Saved.')).toBeVisible()

  await adminContext.close()
  await userContext.close()
})
