import { expect, test } from '@playwright/test'

// Regression test for a bug found right after the chat-shell scroll-chaining
// fix (see chat.spec.js): that fix set `overflow: hidden` on html/body
// GLOBALLY, which stopped the CHAT from scroll-chaining onto the page - but
// also broke ordinary page scrolling on every OTHER page (the admin panel,
// login/register), which rely on the page itself scrolling when their
// content is taller than the viewport (they use `min-h-dvh`, not `h-dvh`,
// specifically to allow that). The fix is scoped to the logged-in chat
// shell's own root element instead (see LoggedInLayout.jsx) - this proves
// an ordinary page can still scroll.
test('the register page (and, by the same mechanism, every non-chat page) can still scroll when its content is taller than the viewport', async ({
  page,
}) => {
  // Short enough that the form (username, display name, email, password,
  // confirm password, hints, the Sign up button, the Google button) cannot
  // possibly fit without scrolling.
  await page.setViewportSize({ width: 400, height: 500 })
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  const signUpButton = page.getByRole('button', { name: 'Sign up' })
  await expect(signUpButton).not.toBeInViewport()

  await page.mouse.wheel(0, 2000)
  await expect(signUpButton).toBeInViewport()

  // The page itself moved - not some inner scroll container standing in
  // for it (there is no such container on this page).
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
})
