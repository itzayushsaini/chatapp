// The copy in localStorage lets public/theme-init.js apply it before React loads.

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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#202c33' : '#00a884')
}

export function applyTheme(theme) {
  current = theme === 'dark' || theme === 'system' ? theme : 'light'
  try {
    localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // not remembered, but still applied now
  }
  paint()
}

systemDark.addEventListener('change', () => {
  if (current === 'system') paint()
})

paint()
