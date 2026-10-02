import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const UPDATE_TEXT_MAX = 1000

// A post in the "PingMe" updates channel - the app's own read-only chat,
// like WhatsApp's official account, where admins announce new features.
//
// Deliberately NOT a Message in a Conversation with a fake "PingMe" user:
// that would need exceptions in search, friend requests and the "only
// friends can message" checks. A collection of its own leaves every friend
// rule exactly as it is.
const updateSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, maxlength: UPDATE_TEXT_MAX, default: '' },
    // The photo's bytes in GridFS (bucket "uploads"), like every other file.
    imageFileId: { type: ObjectId, default: null },
    // The admin who posted it - kept for the record, never shown to users:
    // to them every post comes from "PingMe".
    author: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

updateSchema.pre('validate', function () {
  if (!this.text && !this.imageFileId) this.invalidate('text', 'An update needs text or a photo')
})

export const Update = mongoose.model('Update', updateSchema)
