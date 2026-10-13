import { expect } from '@playwright/test'

export const PASSWORD = 'e2e-password-123'

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)

// also adds the required profile photo, unless { photo: false }
export async function register(page, username, displayName, { photo = true } = {}) {
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByLabel('Email').fill(`${username}@gmail.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: 'Add your profile photo' })).toBeVisible()
  if (!photo) return
  await addProfilePhoto(page)
}

export async function addProfilePhoto(page) {
  await page.getByLabel('Choose a profile picture').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('button', { name: 'Edit your profile' })).toBeVisible()
}

export async function searchFor(page, text, username = text) {
  await page.getByRole('tab', { name: 'Add Friend' }).click()
  await page.getByLabel('Search by name or username').fill(text)
  await page.getByRole('button', { name: 'Search' }).click()
  return page.getByRole('list', { name: 'Search results' }).getByRole('listitem').filter({ hasText: `@${username}` })
}

export async function befriend(a, b, bUsername) {
  await (await searchFor(a, bUsername)).getByRole('button', { name: 'Add friend' }).click()

  await b.getByRole('tab', { name: /Requests/ }).click()
  await b.getByRole('button', { name: 'Accept' }).click()
  await b.getByRole('tab', { name: 'Chats' }).click()
  await a.getByRole('tab', { name: 'Chats' }).click()
}

export const imageLoaded = (img) => img.evaluate((el) => el.complete && el.naturalWidth > 0)
