// Runs before React (a plain <script> in index.html's <head>), so a page
// load in dark mode is dark from the very first paint instead of flashing
// white while the app starts. It only reads the copy of the preference this
// browser remembered last time - the saved one on the account is applied
// again by utils/theme.js once the user has loaded.
//
// A separate file rather than an inline <script>: the Content Security
// Policy (helmet) does not allow inline scripts.
;(function () {
  var theme = 'light'
  try {
    theme = localStorage.getItem('pingme:theme') || 'light'
  } catch {
    // Storage blocked - light it is.
  }
  var dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // The phone's top bar (and, once installed, the app's title bar) matches
  // from the very first frame too. utils/theme.js keeps it in step after.
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#202c33' : '#00a884')
})()
