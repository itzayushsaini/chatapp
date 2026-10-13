import mongoose from 'mongoose'

const settingSchema = new mongoose.Schema(
  {
    // One fixed, unique key, so only one settings document can ever exist
    singletonKey: { type: String, default: 'singleton', unique: true },
    // Also what keeps out temp-mail addresses in practice
    allowedEmailDomains: { type: [String], default: ['gmail.com'] },
    registrationOpen: { type: Boolean, default: true },
    attachmentsEnabled: { type: Boolean, default: true },
    forwardingEnabled: { type: Boolean, default: true },
    deleteForEveryoneWindowMinutes: { type: Number, default: 60, min: 1, max: 10080 },
    announcement: {
      type: new mongoose.Schema(
        { enabled: { type: Boolean, default: false }, text: { type: String, default: '', maxlength: 200 } },
        { _id: false },
      ),
      default: () => ({}),
    },
    aiEnabled: { type: Boolean, default: true },
    // Per user per rolling 24 hours, so one person can't use up the app's free Gemini quota
    aiDailyLimit: { type: Number, default: 50, min: 1, max: 1000 },
    // Off by default: Gemini's image models are not on the free tier
    aiImageGenerationEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const Setting = mongoose.model('Setting', settingSchema)
