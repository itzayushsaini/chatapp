import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// One browser (or installed app) that wants PingMe's notifications even
// while PingMe is closed. The browser itself creates this "address" when the
// user allows notifications; we only store it, and post to it when needed.
//
//   endpoint - a URL at the browser maker's push service (Google, Mozilla,
//              Apple, Microsoft) that delivers to THIS one device
//   keys     - the device's public keys: every notification is encrypted
//              with them, so the push service in the middle cannot read it
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    // Unique: one device belongs to one account at a time. If someone else
    // logs in on the same browser, the subscription moves to them.
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
