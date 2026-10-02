import { expect, test } from '@playwright/test'

import { PNG, befriend, imageLoaded, register } from './helpers.js'

// PingMe AI, end to end. The server talks to a FAKE Gemini here (see
// fakeGemini.js), so nothing is ever sent to Google and the answers are
// always the same: it repeats the question, adds a list and a table, and
// says which files it was given.

const aiRow = (page) => page.getByRole('button', { name: /^PingMe AI/ })
const aiChat = (page) => page.getByRole('region', { name: 'PingMe AI', exact: true })
const aiLog = (page) => page.getByRole('log', { name: 'Chat with PingMe AI' })

async function ask(page, text) {
  await page.getByLabel('Ask PingMe AI').fill(text)
  await page.getByLabel('Ask PingMe AI').press('Enter')
}

test('ask PingMe AI: the answer streams in with reasoning and formatting, and it remembers the chat', async ({ page }) => {
  await register(page, 'riya_ai', 'Riya')

  // Pinned at the top of Chats, above the PingMe updates channel.
  await expect(aiRow(page)).toContainText('Ask me anything')
  await aiRow(page).click()
  await expect(aiChat(page).getByText("Hi! I'm PingMe AI")).toBeVisible()
  await expect(aiChat(page).getByText(/goes to Google to get an answer/)).toBeVisible()

  // A suggestion asks it straight away.
  await aiChat(page).getByRole('button', { name: 'Explain recursion with a simple example' }).click()
  const log = aiLog(page)
  await expect(log.getByText('You asked: "Explain recursion with a simple example"')).toBeVisible()
  // Markdown becomes real formatting, never HTML from the text itself.
  await expect(log.locator('strong', { hasText: 'three tips' })).toBeVisible()
  // (The message list is an <ol> itself - this is the numbered list INSIDE the answer.)
  await expect(log.locator('ol ol > li', { hasText: 'Take short breaks' })).toBeVisible()
  await expect(log.getByRole('cell', { name: 'Monday' })).toBeVisible()

  // The reasoning is tucked away behind a button.
  await expect(log.getByText('Reading the question')).toHaveCount(0)
  await log.getByRole('button', { name: 'Show reasoning' }).click()
  await expect(log.locator('strong', { hasText: 'Reading the question' })).toBeVisible()
  await log.getByRole('button', { name: 'Hide reasoning' }).click()

  // The next question carries the conversation so far.
  await ask(page, 'What did I just ask?')
  await expect(log.getByText('I remember 2 earlier messages.')).toBeVisible()

  // "Think deeper" is a switch above the box, and the question is labelled.
  await page.getByRole('button', { name: 'Think deeper' }).click()
  await expect(page.getByRole('button', { name: 'Think deeper' })).toHaveAttribute('aria-pressed', 'true')
  await ask(page, 'Plan my exam week')
  await expect(log.getByRole('listitem').filter({ hasText: 'Think deeper' }).filter({ hasText: 'Plan my exam week' })).toBeVisible()
  await expect(log.getByText('You asked: "Plan my exam week"')).toBeVisible()

  // Saved on the server: still there after a reload, and the row previews it.
  await page.reload()
  await expect(aiRow(page)).toContainText('You asked: "Plan my exam week"')
  await aiRow(page).click()
  await expect(aiLog(page).getByText('What did I just ask?', { exact: true })).toBeVisible()

  // On a phone, a wide answer (the table) never makes the page scroll sideways.
  await page.setViewportSize({ width: 375, height: 740 })
  await expect(aiLog(page).getByRole('cell', { name: 'Monday' }).first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('Stop, a failed answer with Try again, and clearing the chat', async ({ page }) => {
  await register(page, 'aman_ai', 'Aman')
  await aiRow(page).click()
  const log = aiLog(page)

  // While it answers, the round button is Stop; stopping keeps what arrived.
  await ask(page, 'Tell me a slow story')
  await expect(log.getByText(/Once upon/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop answering' }).click()
  await expect(log.getByText('You stopped this answer.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop answering' })).toHaveCount(0)

  // Gemini overloaded (both models): a readable error, then Try again works.
  await ask(page, 'Please fail once')
  await expect(log.getByText('PingMe AI is busy right now - please try again in a minute.')).toBeVisible()
  await log.getByRole('button', { name: 'Try again' }).click()
  await expect(log.getByText('You asked: "Please fail once"')).toBeVisible()
  await expect(log.getByText(/PingMe AI is busy right now/)).toHaveCount(0)

  // Clear chat asks first, then empties it - the welcome screen is back.
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

  // A photo with a question: PingMe AI is sent the photo itself.
  await aiRow(riya).click()
  await riya.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG })
  await ask(riya, 'What is written here?')
  const log = aiLog(riya)
  await expect(log.getByText('I can see your file: image/png.')).toBeVisible()
  await expect.poll(() => imageLoaded(log.getByRole('button', { name: 'Open photo board.png' }).locator('img'))).toBe(true)

  // Kabir asks Riya something; Riya forwards it to PingMe AI.
  await kabir.getByRole('button', { name: /Riya/ }).click()
  await kabir.getByLabel('Type a message').fill('Is the DBMS exam on Friday?')
  await kabir.getByLabel('Type a message').press('Enter')

  await riya.getByRole('button', { name: /Kabir/ }).click()
  const bubble = riya.getByRole('listitem').filter({ hasText: 'Is the DBMS exam on Friday?' })
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

  // The admin switches it on (it is off by default: it needs a paid plan).
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

  // Opening the chat again picks up the change.
  await user.reload()
  await aiRow(user).click()
  await user.getByRole('button', { name: 'Imagine' }).click()
  await expect(user.getByLabel('Ask PingMe AI')).toHaveAttribute('placeholder', 'Describe the picture you want...')
  await ask(user, 'a small green square')
  const log = aiLog(user)
  await expect(log.getByText('Here is your picture!')).toBeVisible()
  await expect.poll(() => imageLoaded(log.getByRole('button', { name: /Open photo pingme-ai/ }).locator('img'))).toBe(true)

  // Leave the shared test server as it was.
  await admin.getByLabel('Creating pictures ("Imagine")').uncheck()
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.getByText('Saved.')).toBeVisible()

  await adminContext.close()
  await userContext.close()
})
