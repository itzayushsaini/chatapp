import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    // Unique: if someone else logs in on the same browser, it moves to them
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true },
)

pushSubscriptionSchema.index({ user: 1 })

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema)
