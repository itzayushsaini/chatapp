import { Router } from 'express'

import { googleEnabled } from '../services/googleAuthService.js'
import { getSettings, publicSettingsView } from '../services/settingsService.js'

const router = Router()

// Unauthenticated on purpose: the login and register pages, and the
// announcement banner, all need this before anyone is logged in.
// `googleSignIn` comes from the server's environment, not the settings
// document - it only says whether the "Continue with Google" button should
// be shown at all.
router.get('/public', async (req, res) => {
  res.json({ settings: { ...publicSettingsView(await getSettings()), googleSignIn: googleEnabled() } })
})

export default router
