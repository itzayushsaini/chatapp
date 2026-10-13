import { expect, test } from '@playwright/test'

import { befriend, register } from './helpers.js'

// Chromium's fake microphone (a test tone) with the permission prompt auto-accepted
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

async function newPerson(browser) {
  const context = await browser.newContext({ permissions: ['microphone'] })
  return { context, page: await context.newPage() }
}

test('record, send and play a voice note - with speed, swipe-to-cancel and Contact info', async ({ browser }) => {
  const aman = await newPerson(browser)
  const priya = await newPerson(browser)
  await register(aman.page, 'aman_voice', 'Aman Kumar')
  await register(priya.page, 'priya_voice', 'Priya Sharma')
  await befriend(aman.page, priya.page, 'priya_voice')

  const a = aman.page
  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(a.getByLabel('Type a message')).toBeEnabled()

  const mic = a.getByRole('button', { name: 'Record a voice note' })
  await expect(mic).toBeVisible()
  await a.getByLabel('Type a message').fill('x')
  await expect(mic).toHaveCount(0)
  await expect(a.getByRole('button', { name: 'Send message' })).toBeVisible()
  await a.getByLabel('Type a message').fill('')

  await mic.click()
  const recorder = a.getByRole('group', { name: 'Recording a voice note' })
  await expect(recorder).toBeVisible()
  await expect(recorder.getByText('0:01')).toBeVisible({ timeout: 5000 })
  await recorder.getByRole('button', { name: 'Send voice note' }).click()
  await expect(recorder).toHaveCount(0)

  const aLog = a.getByRole('log', { name: 'Messages' })
  await expect(aLog.getByRole('button', { name: 'Play voice message' })).toBeVisible()
  await expect(a.getByText('You: 🎤 Voice message')).toBeVisible()
  await expect(aLog.getByText('Delivered', { exact: true })).toBeVisible()

  await mic.click()
  await expect(recorder).toBeVisible()
  const strip = recorder.getByText('‹ Slide to cancel')
  const box = await strip.boundingBox()
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await a.mouse.down()
  await a.mouse.move(box.x - 250, box.y + box.height / 2, { steps: 12 })
  await a.mouse.up()
  await expect(recorder).toHaveCount(0)
  await expect(aLog.getByRole('button', { name: 'Play voice message' })).toHaveCount(1)

  // only a kind: 'audio' attachment gets a voice player, so this checks the server's type detection
  const p = priya.page
  await p.getByRole('button', { name: /Aman Kumar/ }).click()
  const pLog = p.getByRole('log', { name: 'Messages' })
  const play = pLog.getByRole('button', { name: 'Play voice message' })
  await expect(play).toBeVisible()
  await expect(pLog.getByRole('slider', { name: 'Voice message position' })).toBeVisible()

  const speed = pLog.getByRole('button', { name: /Playback speed/ })
  await expect(speed).toHaveText('1×')
  await speed.click()
  await expect(speed).toHaveText('1.5×')
  await speed.click()
  await expect(speed).toHaveText('2×')
  await speed.click()
  await expect(speed).toHaveText('1×')

  await play.click()
  await expect(pLog.getByRole('button', { name: 'Pause voice message' })).toBeVisible()

  await p.getByRole('heading', { name: 'Aman Kumar' }).getByRole('button').click()
  const info = p.getByRole('complementary', { name: 'Contact info' })
  await expect(info.getByText('Voice messages (1)')).toBeVisible()
  await expect(info.getByRole('button', { name: /voice message/i }).first()).toBeVisible()

  await aman.context.close()
  await priya.context.close()
})

test('a voice note too short to be real is not sent', async ({ browser }) => {
  const aman = await newPerson(browser)
  const priya = await newPerson(browser)
  await register(aman.page, 'aman_short', 'Aman Kumar')
  await register(priya.page, 'priya_short', 'Priya Sharma')
  await befriend(aman.page, priya.page, 'priya_short')

  const a = aman.page
  await a.getByRole('button', { name: /Priya Sharma/ }).click()
  await expect(a.getByLabel('Type a message')).toBeEnabled()

  await a.getByRole('button', { name: 'Record a voice note' }).click()
  await a.getByRole('button', { name: 'Send voice note' }).click()
  await expect(a.getByText(/too short/)).toBeVisible()
  await expect(a.getByRole('log', { name: 'Messages' }).getByRole('button', { name: 'Play voice message' })).toHaveCount(0)

  await aman.context.close()
  await priya.context.close()
})
