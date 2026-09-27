import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    // Optional when there is an attachment (a photo with no caption), but a
    // message must have at least one of the two - checked below.
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    attachment: { type: ObjectId, ref: 'Attachment', default: null },
    // A UUID made by the browser before sending. If the send is retried after
    // a timeout, the same clientId comes again and we return the message that
    // was already saved instead of storing it twice.
    clientId: { type: String, required: true },
  },
  { timestamps: true },
)

messageSchema.pre('validate', function () {
  if (!this.text && !this.attachment) this.invalidate('text', 'A message needs text or an attachment')
})

// History is always "messages of ONE conversation, newest first", paging by
// _id. This index answers that without scanning or sorting in memory.
messageSchema.index({ conversation: 1, _id: -1 })
// Makes retries idempotent at database level (see clientId above).
messageSchema.index({ sender: 1, clientId: 1 }, { unique: true })

export const Message = mongoose.model('Message', messageSchema)
