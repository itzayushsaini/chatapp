import { Router } from 'express'

import { googleEnabled } from '../services/googleAuthService.js'
import { getSettings, publicSettingsView } from '../services/settingsService.js'

const router = Router()

// Public on purpose: the login page and the banner need it before anyone logs in
router.get('/public', async (req, res) => {
  res.json({ settings: { ...publicSettingsView(await getSettings()), googleSignIn: googleEnabled() } })
})

export default router
