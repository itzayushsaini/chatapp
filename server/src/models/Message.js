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
    // A snapshot taken AT SEND TIME, not a live reference - so the quoted
    // preview still reads correctly even after the original message is later
    // deleted. null when this message is not a reply.
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
    // Soft delete only - the real text/attachment stay in the database so
    // "delete for everyone" can still be undone at the database level if
    // ever needed, but every read path must hide them once this is true.
    deletedForEveryone: { type: Boolean, default: false },
    // Ids of users who chose "delete for me". Hidden from their view only;
    // the other participant still sees the message normally.
    deletedFor: { type: [ObjectId], default: [] },
    // True for a message created by forwarding another one. We only need to
    // show a "Forwarded" label, not the original message's history.
    forwarded: { type: Boolean, default: false },
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
