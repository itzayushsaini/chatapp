import { expect, test } from '@playwright/test'

test('the register page (and, by the same mechanism, every non-chat page) can still scroll when its content is taller than the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 500 })
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  const signUpButton = page.getByRole('button', { name: 'Sign up' })
  await expect(signUpButton).not.toBeInViewport()

  await page.mouse.wheel(0, 2000)
  await expect(signUpButton).toBeInViewport()

  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
})
