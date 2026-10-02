import { Setting } from '../models/Setting.js'
import { isConfigured as isAiConfigured } from './geminiClient.js'
import { emitToAll } from '../socket/emitter.js'

const SINGLETON_KEY = 'singleton'

// There is always exactly one Setting document. Upserting on the first read
// means no separate "seed the settings" step is ever needed - a brand new
// database just gets the schema's defaults the first time anything asks.
export async function getSettings() {
  const settings = await Setting.findOneAndUpdate(
    { singletonKey: SINGLETON_KEY },
    { $setOnInsert: { singletonKey: SINGLETON_KEY } },
    { upsert: true, new: true },
  )
  return settings
}

// The subset safe to show to anyone, logged in or not - used by the
// register/login pages and the announcement banner.
export function publicSettingsView(settings) {
  return {
    registrationOpen: settings.registrationOpen,
    allowedEmailDomains: settings.allowedEmailDomains,
    announcement: { enabled: settings.announcement.enabled, text: settings.announcement.text },
  }
}

// Everything, for the admin panel itself.
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
    // Read-only: whether the server has a GEMINI_API_KEY at all. Without
    // one, PingMe AI stays hidden whatever the switch above says.
    aiConfigured: isAiConfigured(),
  }
}

// `patch` has already been through zod (see routes/admin.routes.js), so every
// field here is the right type and within range - this just applies whatever
// was actually sent, leaving anything omitted unchanged.
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

  // Every connected client (logged in or not) picks up the new banner /
  // registration state live, without needing to reload.
  emitToAll('settings:updated', publicSettingsView(settings))

  return settings
}
