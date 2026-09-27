import { expect } from '@playwright/test'

export const PASSWORD = 'e2e-password-123'

// A genuine 1x1 PNG - small, but a real image the browser can decode.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)

export async function register(page, username, displayName) {
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByLabel('Email').fill(`${username}@gmail.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText(`@${username}`).first()).toBeVisible()
}

// Makes `a` and `b` friends through the UI: a sends, b accepts.
export async function befriend(a, b, bUsername) {
  await a.getByRole('tab', { name: 'Add Friend' }).click()
  await a.getByLabel('Find a friend by their exact username').fill(bUsername)
  await a.getByRole('button', { name: 'Search' }).click()
  await a.getByRole('button', { name: 'Add friend' }).click()

  await b.getByRole('tab', { name: /Requests/ }).click()
  await b.getByRole('button', { name: 'Accept' }).click()
  await b.getByRole('tab', { name: 'Chats' }).click()
  await a.getByRole('tab', { name: 'Chats' }).click()
}

// True once an <img> has actually loaded and decoded (not just been added).
export const imageLoaded = (img) => img.evaluate((el) => el.complete && el.naturalWidth > 0)
