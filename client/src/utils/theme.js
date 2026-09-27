// Light / dark / "same as my device" (system).
//
// The choice is saved on the account (PATCH /users/me { theme }), so it
// follows the user to any browser they log in on. A copy is also kept in
// localStorage, so public/theme-init.js can apply it before React has even
// loaded - and so the login page keeps the last user's theme.
//
// All the actual colours are in index.css: this file only sets
// <html data-theme="dark|light">.

const STORAGE_KEY = 'pingme:theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

let current = readStored()

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'light'
  } catch {
    return 'light'
  }
}

function paint() {
  const dark = current === 'dark' || (current === 'system' && systemDark.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // The browser's own UI (the address bar on phones) follows along.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#202c33' : '#00a884')
}

export function applyTheme(theme) {
  current = theme === 'dark' || theme === 'system' ? theme : 'light'
  try {
    localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // Not remembered for next time - it still applies now.
  }
  paint()
}

// "System" follows the device live: switching the OS to dark mode while
// PingMe is open re-colours it at once.
systemDark.addEventListener('change', () => {
  if (current === 'system') paint()
})

paint()
