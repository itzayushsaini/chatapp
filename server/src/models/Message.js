import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    attachment: { type: ObjectId, ref: 'Attachment', default: null },
    clientId: { type: String, required: true },
    // A snapshot taken at send time, so the quote survives the original being deleted
    replyTo: {
      type: new mongoose.Schema(
        {
          messageId: { type: ObjectId, ref: 'Message' },
          senderId: { type: ObjectId, ref: 'User' },
          textSnippet: String,
          attachmentKind: String,
        },
        { _id: false },
      ),
      default: null,
    },
    // Soft delete: the content stays stored, so every read path must hide it
    deletedForEveryone: { type: Boolean, default: false },
    deletedFor: { type: [ObjectId], default: [] },
    forwarded: { type: Boolean, default: false },
  },
  { timestamps: true },
)

messageSchema.pre('validate', function () {
  if (!this.text && !this.attachment) this.invalidate('text', 'A message needs text or an attachment')
})

messageSchema.index({ conversation: 1, _id: -1 })
// Makes a retried send (same clientId) idempotent
messageSchema.index({ sender: 1, clientId: 1 }, { unique: true })

export const Message = mongoose.model('Message', messageSchema)
