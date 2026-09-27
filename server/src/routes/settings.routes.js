import { Router } from 'express'

import { getSettings, publicSettingsView } from '../services/settingsService.js'

const router = Router()

// Unauthenticated on purpose: the login and register pages, and the
// announcement banner, all need this before anyone is logged in.
router.get('/public', async (req, res) => {
  res.json({ settings: publicSettingsView(await getSettings()) })
})

export default router
