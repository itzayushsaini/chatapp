import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

test('a single grey tick turns into a blue double tick once they open the chat', async ({
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
  const amanLog = aman.getByRole('log', { name: 'Messages' })

  await aman.getByLabel('Type a message').fill('Are you there?')
  await aman.getByLabel('Type a message').press('Enter')

  // Priya has not opened the chat yet: one grey tick.
  await expect(amanLog.getByText('Sent', { exact: true })).toBeVisible()
  await expect(amanLog.getByText('Read', { exact: true })).toBeHidden()

  // She opens it - the tick turns into a blue double tick, live, with no
  // reload on Aman's side.
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
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
