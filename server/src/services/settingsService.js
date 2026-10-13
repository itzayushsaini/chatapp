import { Setting } from '../models/Setting.js'
import { isConfigured as isAiConfigured } from './geminiClient.js'
import { emitToAll } from '../socket/emitter.js'

const SINGLETON_KEY = 'singleton'

// Upserts on first read, so a new database just gets the defaults (no seed step)
export async function getSettings() {
  const settings = await Setting.findOneAndUpdate(
    { singletonKey: SINGLETON_KEY },
    { $setOnInsert: { singletonKey: SINGLETON_KEY } },
    { upsert: true, new: true },
  )
  return settings
}

// Shown to anyone, even logged out, so only these fields
export function publicSettingsView(settings) {
  return {
    registrationOpen: settings.registrationOpen,
    allowedEmailDomains: settings.allowedEmailDomains,
    announcement: { enabled: settings.announcement.enabled, text: settings.announcement.text },
  }
}

export function adminSettingsView(settings) {
  return {
    allowedEmailDomains: settings.allowedEmailDomains,
    registrationOpen: settings.registrationOpen,
    attachmentsEnabled: settings.attachmentsEnabled,
    forwardingEnabled: settings.forwardingEnabled,
    deleteForEveryoneWindowMinutes: settings.deleteForEveryoneWindowMinutes,
    announcement: { enabled: settings.announcement.enabled, text: settings.announcement.text },
    aiEnabled: settings.aiEnabled,
    aiDailyLimit: settings.aiDailyLimit,
    aiImageGenerationEnabled: settings.aiImageGenerationEnabled,
    aiConfigured: isAiConfigured(),
  }
}

export async function updateSettings(patch) {
  const settings = await getSettings()

  if (patch.allowedEmailDomains) settings.allowedEmailDomains = patch.allowedEmailDomains
  if (typeof patch.registrationOpen === 'boolean') settings.registrationOpen = patch.registrationOpen
  if (typeof patch.attachmentsEnabled === 'boolean') settings.attachmentsEnabled = patch.attachmentsEnabled
  if (typeof patch.forwardingEnabled === 'boolean') settings.forwardingEnabled = patch.forwardingEnabled
  if (patch.deleteForEveryoneWindowMinutes) {
    settings.deleteForEveryoneWindowMinutes = patch.deleteForEveryoneWindowMinutes
  }
  if (patch.announcement) {
    if (typeof patch.announcement.enabled === 'boolean') {
      settings.announcement.enabled = patch.announcement.enabled
    }
    if (typeof patch.announcement.text === 'string') settings.announcement.text = patch.announcement.text
  }
  if (typeof patch.aiEnabled === 'boolean') settings.aiEnabled = patch.aiEnabled
  if (patch.aiDailyLimit) settings.aiDailyLimit = patch.aiDailyLimit
  if (typeof patch.aiImageGenerationEnabled === 'boolean') {
    settings.aiImageGenerationEnabled = patch.aiImageGenerationEnabled
  }

  await settings.save()

  emitToAll('settings:updated', publicSettingsView(settings))

  return settings
}
