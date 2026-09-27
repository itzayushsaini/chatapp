import { expect, test } from '@playwright/test'

import { befriend, imageLoaded, PDF, PNG, register } from './helpers.js'

test('editing my profile: photo, display name, bio and username', async ({ page }) => {
  await register(page, 'neha_e2e', 'Neha')

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your profile' })

  // The photo is cropped in the browser and saved as soon as it is chosen.
  await dialog
    .getByLabel('Choose a profile picture')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  const footerPhoto = page.getByRole('button', { name: 'Edit your profile' }).locator('img')
  await expect.poll(() => imageLoaded(footerPhoto)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Remove photo' })).toBeVisible()

  await dialog.getByLabel('Display name').fill('Neha Kapoor')
  await dialog.getByLabel('Bio').fill('Loves clean UI')
  await dialog.getByLabel('Username').fill('neha_new')
  page.once('dialog', (confirm) => confirm.accept()) // "Change your username to...?"
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Profile saved')).toBeVisible()
  const me = page.getByRole('button', { name: 'Edit your profile' })
  await expect(me).toContainText('@neha_new')
  await expect(me).toContainText('Neha Kapoor')

  // Saved on the server, not just on screen.
  await page.reload()
  await expect(me).toContainText('@neha_new')
  await expect.poll(() => imageLoaded(footerPhoto)).toBe(true)

  // The 30-day rule: the username field is now locked, and says until when.
  await page.getByRole('button', { name: 'Edit your profile' }).click()
  await expect(dialog.getByLabel('Username')).toBeDisabled()
  await expect(dialog.getByText(/You can change your username again on/)).toBeVisible()
  await expect(dialog.getByLabel('Bio')).toHaveValue('Loves clean UI')
})

test('photos and documents are delivered, and profile changes appear live', async ({ browser }) => {
  const amanContext = await browser.newContext()
  const priyaContext = await browser.newContext()
  const aman = await amanContext.newPage()
  const priya = await priyaContext.newPage()

  await register(aman, 'aman_files', 'Aman Kumar')
  await register(priya, 'priya_files', 'Priya Sharma')
  await befriend(aman, priya, 'priya_files')

  await aman.getByRole('button', { name: /Priya Sharma/ }).click()
  const amanLog = aman.getByRole('log', { name: 'Messages' })

  // --- A photo with a caption ---------------------------------------------
  await aman
    .getByTestId('attach-input')
    .setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: PNG })

  // The preview comes from a blob: URL - this also proves the production
  // Content-Security-Policy allows it.
  const preview = aman.getByRole('button', { name: 'Remove poster.png' }).locator('..').locator('img')
  await expect.poll(() => imageLoaded(preview)).toBe(true)

  await aman.getByLabel('Type a message').fill('Our poster')
  await aman.getByLabel('Type a message').press('Enter')

  const sentPhoto = amanLog.getByRole('img', { name: 'poster.png' })
  await expect(sentPhoto).toHaveAttribute('src', /^\/api\/attachments\/[a-f0-9]{24}$/)
  await expect.poll(() => imageLoaded(sentPhoto)).toBe(true)
  // Priya is online, so it is delivered straight away.
  await expect(amanLog.getByText('Delivered', { exact: true })).toBeVisible()

  // Priya sees the preview in her sidebar, then the photo itself.
  await expect(priya.getByText('📷 Our poster')).toBeVisible()
  await priya.getByRole('button', { name: /Aman Kumar/ }).click()
  const priyaLog = priya.getByRole('log', { name: 'Messages' })
  const receivedPhoto = priyaLog.getByRole('img', { name: 'poster.png' })
  await expect.poll(() => imageLoaded(receivedPhoto)).toBe(true)
  await expect(priyaLog.getByText('Our poster')).toBeVisible()

  // Clicking it opens it full size.
  await priyaLog.getByRole('button', { name: 'Open photo poster.png' }).click()
  await expect(priya.getByRole('dialog', { name: 'poster.png' })).toBeVisible()
  await priya.keyboard.press('Escape')
  await expect(priya.getByRole('dialog', { name: 'poster.png' })).toBeHidden()

  // --- A document with no caption -----------------------------------------
  await aman
    .getByTestId('attach-input')
    .setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: PDF })
  await aman.getByRole('button', { name: 'Send message' }).click()

  const docLink = priyaLog.getByRole('link', { name: /notes\.pdf/ })
  await expect(docLink).toBeVisible()
  const response = await priyaContext.request.get(await docLink.getAttribute('href'))
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  expect(response.headers()['content-disposition']).toMatch(/^attachment/)

  // --- Aman edits his bio: Priya sees it without reloading -----------------
  await aman.getByRole('button', { name: 'Edit your profile' }).click()
  await aman.getByRole('dialog', { name: 'Your profile' }).getByLabel('Bio').fill('Team lead')
  await aman.getByRole('button', { name: 'Save' }).click()
  await expect(aman.getByText('Profile saved')).toBeVisible()

  await priya.getByRole('heading', { name: 'Aman Kumar' }).getByRole('button').click()
  const info = priya.getByRole('complementary', { name: 'Contact info' })
  await expect(info.getByText('Team lead')).toBeVisible()
  // The chat's shared photo and document are listed there too.
  await expect(info.getByRole('button', { name: 'Open photo poster.png' })).toBeVisible()
  await expect(info.getByRole('link', { name: /notes\.pdf/ })).toBeVisible()

  await amanContext.close()
  await priyaContext.close()
})
