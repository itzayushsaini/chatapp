import mongoose from 'mongoose'

// Exactly one document ever exists (see settingsService.getSettings) - this
// is the "admin panel" data: every knob an admin can flip lives here instead
// of being hardcoded, so changing one is a database update, not a deploy.
const settingSchema = new mongoose.Schema(
  {
    // Guarantees a single document: every read/write goes through the same
    // fixed key, and the unique index stops a second one ever being created.
    singletonKey: { type: String, default: 'singleton', unique: true },
    // Registration's email must end in one of these (case-insensitive). This
    // is also what blocks throwaway/temp-mail addresses in practice, without
    // maintaining a list of disposable-mail providers that goes stale.
    allowedEmailDomains: { type: [String], default: ['gmail.com'] },
    registrationOpen: { type: Boolean, default: true },
    attachmentsEnabled: { type: Boolean, default: true },
    forwardingEnabled: { type: Boolean, default: true },
    // Minutes, not milliseconds, so the admin form deals in a human unit.
    deleteForEveryoneWindowMinutes: { type: Number, default: 60, min: 1, max: 10080 },
    announcement: {
      type: new mongoose.Schema(
        { enabled: { type: Boolean, default: false }, text: { type: String, default: '', maxlength: 200 } },
        { _id: false },
      ),
      default: () => ({}),
    },
    // PingMe AI. It is also hidden when the server has no GEMINI_API_KEY,
    // whatever this says (see aiService.isAvailable).
    aiEnabled: { type: Boolean, default: true },
    // Answers per user in any rolling 24 hours - the free Gemini tier has a
    // daily cap for the WHOLE app, so one person must not be able to use it up.
    aiDailyLimit: { type: Number, default: 50, min: 1, max: 1000 },
    // Off by default: Gemini's image models are not on the free tier, so with
    // a free key every attempt would only fail.
    aiImageGenerationEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const Setting = mongoose.model('Setting', settingSchema)
