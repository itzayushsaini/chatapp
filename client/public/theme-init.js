// Runs before React so dark mode doesn't flash white; a separate file because CSP forbids inline scripts.
;(function () {
  var theme = 'light'
  try {
    theme = localStorage.getItem('pingme:theme') || 'light'
  } catch {
    // storage blocked - stay light
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#202c33' : '#00a884')
})()
