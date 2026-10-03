import { devices, expect, test } from '@playwright/test'

import { register } from './helpers.js'

// PingMe as an installable app (a PWA): the manifest and icons, Chrome's own
// "installable" verdict, the offline page, our Install offers, the iPhone
// steps, and the service worker showing a push notification.

// Width and height of a PNG, read from its header.
const pngSize = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]

// Waits until the service worker is installed AND controls this page (only
// then are page loads routed through it, e.g. for the offline page).
const serviceWorkerReady = (page) =>
  page.waitForFunction(async () => {
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

// What Chrome fires when it decides the site can be installed - faked, so
// the test can see our button calling prompt().
async function offerInstall(page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    window.__installPrompted = false
    event.prompt = async () => {
      window.__installPrompted = true
    }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
}

test('the manifest, icons and service worker make PingMe installable', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')

  const manifestRes = await page.request.get('/manifest.webmanifest')
  expect(manifestRes.headers()['content-type']).toContain('application/manifest+json')
  const manifest = await manifestRes.json()
  expect(manifest).toMatchObject({
    name: 'PingMe',
    short_name: 'PingMe',
    start_url: '/',
    display: 'standalone',
    theme_color: '#00a884',
  })

  // Every icon loads, is a PNG, and really has the size the manifest says.
  const icons = [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }, { src: '/icons/badge-96.png', sizes: '96x96' }]
  for (const icon of icons) {
    const res = await page.request.get(icon.src)
    expect(res.status(), icon.src).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    expect(pngSize(await res.body()).join('x'), icon.src).toBe(icon.sizes)
  }
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)

  // The service worker is running - and Chrome itself finds nothing missing.
  await serviceWorkerReady(page)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  expect(installabilityErrors).toEqual([])
})

test('opened with no connection, PingMe shows its own offline page', async ({ page, context }) => {
  await page.goto('/')
  await serviceWorkerReady(page)

  await context.setOffline(true)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()
  await expect.poll(() => page.locator('img').evaluate((img) => img.naturalWidth)).toBe(192) // the saved icon

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Real conversations')
})

test('the Install offer calls the browser’s install prompt; Settings knows when it is installed', async ({ page }) => {
  await register(page, 'riya_pwa', 'Riya')
  // Chrome has not offered installing (yet): no offer in the chat list.
  await expect(page.getByText('Install PingMe as an app')).toHaveCount(0)

  await offerInstall(page)
  const offer = page.getByText('Install PingMe as an app').locator('..')
  await expect(offer).toBeVisible()
  await offer.getByRole('button', { name: 'Install', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(true)
  await expect(offer).toBeHidden()

  // The ×: dismissed for good on this device.
  await offerInstall(page)
  await page.getByRole('button', { name: 'Dismiss install offer' }).click()
  await page.reload()
  await expect(page.getByText('@riya_pwa').first()).toBeVisible()
  await offerInstall(page)
  await expect(page.getByText('Install PingMe as an app')).toHaveCount(0)

  // Settings → App still offers it, then knows once it is installed.
  await page.getByRole('link', { name: 'Settings' }).click()
  const app = page.getByRole('region', { name: 'App' })
  await expect(app.getByRole('button', { name: 'Install PingMe' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(app).toContainText('PingMe is installed on this device')
})

test('on an iPhone, Install shows the Add to Home Screen steps', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 12'] })
  const page = await context.newPage()

  // The home page offers it straight away...
  await page.goto('/')
  await page.getByRole('button', { name: 'Install the app' }).click()
  const steps = page.getByRole('dialog', { name: 'Install PingMe on your iPhone' })
  await expect(steps).toContainText('Add to Home Screen')
  await steps.getByRole('button', { name: 'Got it' }).click()

  // ...and so does the chat list, once logged in.
  await register(page, 'aman_ios', 'Aman')
  await page.getByText('Install PingMe as an app').locator('..').getByRole('button', { name: 'Install', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Install PingMe on your iPhone' })).toBeVisible()
  await context.close()
})

test('a push from the server shows a notification; tapping one opens the right place', async ({ page, context }) => {
  await register(page, 'kabir_push', 'Kabir')
  await serviceWorkerReady(page)

  // The test browser (Playwright's headless Chromium) never grants
  // notification permission, so showNotification is swapped for a recorder:
  // the test sees exactly what the service worker would put on screen.
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => {
    self.__shown = []
    self.registration.showNotification = async (title, options) => {
      self.__shown.push({ title, ...options })
    }
  })

  // Hand the service worker a push message, the way the browser does when
  // one arrives from the push service.
  const cdp = await context.newCDPSession(page)
  const registrationId = new Promise((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const ours = registrations.find((r) => r.scopeURL.endsWith('/') && !r.isDeleted)
      if (ours) resolve(ours.registrationId)
    })
  })
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify({ title: 'Riya', body: 'Are you coming to the lab?', tag: 'chat-1', open: 'requests' }),
  })

  await expect
    .poll(() => worker.evaluate(() => self.__shown))
    .toEqual([
      {
        title: 'Riya',
        body: 'Are you coming to the lab?',
        icon: '/icons/icon-192.png', // the app icon, as the message had none
        badge: '/icons/badge-96.png',
        tag: 'chat-1',
        renotify: true,
        data: { open: 'requests' },
      },
    ])

  // Tapping it while PingMe is closed opens /?open=... - the app shows that
  // place and tidies the address.
  await page.goto('/?open=requests')
  await expect(page.getByRole('tab', { name: /Requests/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/?open=pingme-ai')
  await expect(page.getByRole('region', { name: 'PingMe AI', exact: true })).toBeVisible()

  // Anything else in the address is ignored.
  await page.goto('/?open=javascript:alert(1)')
  await expect(page.getByText('@kabir_push').first()).toBeVisible()
})
