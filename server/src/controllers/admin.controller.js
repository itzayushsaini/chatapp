import * as adminService from '../services/adminService.js'
import { adminSettingsView, getSettings, updateSettings } from '../services/settingsService.js'

export async function getSettingsController(req, res) {
  res.json({ settings: adminSettingsView(await getSettings()) })
}

export async function updateSettingsController(req, res) {
  const settings = await updateSettings(req.valid.body)
  res.json({ settings: adminSettingsView(settings) })
}

export async function listUsers(req, res) {
  res.json(await adminService.listUsers(req.valid.query))
}

export async function suspendUser(req, res) {
  res.json({ user: await adminService.suspendUser(req.user._id, req.valid.params.userId) })
}

export async function unsuspendUser(req, res) {
  res.json({ user: await adminService.unsuspendUser(req.valid.params.userId) })
}

export async function deleteUser(req, res) {
  await adminService.deleteUser(req.user._id, req.valid.params.userId)
  res.status(204).end()
}

export async function getStats(req, res) {
  res.json(await adminService.getStats())
}
