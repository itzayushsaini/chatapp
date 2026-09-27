import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

test('one grey tick while they are offline, two grey once they come online, blue once they open it', async ({
  browser,
}) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_read', 'Aman Kumar')
  await register(priya, 'priya_read', 'Priya Sharma')
  await befriend(aman, priya, 'priya_read')

  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  const amanChat = aman.getByRole('region', { name: 'Chat with Priya Sharma' })
  const amanLog = aman.getByRole('log', { name: 'Messages' })

  // Priya goes offline (closes the page, keeping her login cookie). Waiting
  // for Aman to SEE her go offline proves the server knows it too, before
  // anything is sent.
  const priyaUrl = priya.url()
  await priya.close()
  await expect(amanChat.getByText(/Last seen/)).toBeVisible()
  await aman.getByLabel('Type a message').fill('Are you there?')
  await aman.getByLabel('Type a message').press('Enter')

  // She is offline: saved, but not delivered - one grey tick.
  await expect(amanLog.getByText('Sent', { exact: true })).toBeVisible()

  // She comes back online (without opening the chat): two grey ticks, live.
  const priyaAgain = await priyaContext.newPage()
  await priyaAgain.goto(priyaUrl)
  await expect(amanLog.getByText('Delivered', { exact: true })).toBeVisible()
  await expect(amanLog.getByText('Read', { exact: true })).toBeHidden()

  // She opens it - the ticks turn blue, live, with no reload on Aman's side.
  await priyaAgain.getByRole('button', { name: /Aman Kumar/ }).click()
  await expect(amanLog.getByText('Read', { exact: true })).toBeVisible()

  await amanContext.close()
  await priyaContext.close()
})

test('a message sent while the chat is already open is read immediately', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_read2', 'Aman Kumar')
  await register(priya, 'priya_read2', 'Priya Sharma')
  await befriend(aman, priya, 'priya_read2')

  // Priya already has the chat open when Aman's message arrives.
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  await aman.getByRole('button', { name: /Priya Sharma/ }).click()

  const amanLog = aman.getByRole('log', { name: 'Messages' })
  await aman.getByLabel('Type a message').fill('Hi, checking in')
  await aman.getByLabel('Type a message').press('Enter')

  await expect(amanLog.getByText('Read', { exact: true })).toBeVisible()

  await amanContext.close()
  await priyaContext.close()
})

test('shows "typing…" to the other person while someone types', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_typing', 'Aman Kumar')
  await register(priya, 'priya_typing', 'Priya Sharma')
  await befriend(aman, priya, 'priya_typing')

  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  await aman.getByRole('button', { name: /Priya Sharma/ }).click()

  const priyaChat = priya.getByRole('region', { name: 'Chat with Aman Kumar' })
  await aman.getByLabel('Type a message').pressSequentially('Hello the')
  await expect(priyaChat.getByText('typing…')).toBeVisible()

  // Sending ends it.
  await aman.getByLabel('Type a message').press('Enter')
  await expect(priyaChat.getByText('typing…')).toBeHidden()

  await amanContext.close()
  await priyaContext.close()
})
