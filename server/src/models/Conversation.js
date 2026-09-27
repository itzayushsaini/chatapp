import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const conversationSchema = new mongoose.Schema(
  {
    // Always the two user ids, sorted, so a pair has one fixed order.
    participants: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: (v) => v.length === 2,
    },
    // Same key as the pair's Friendship. Unique, so a pair can only ever have
    // one conversation - it is reused if they unfriend and re-friend.
    pairKey: { type: String, required: true, unique: true },
    // A copy of the newest message, so the sidebar can show a preview without
    // querying the messages collection once per friend.
    lastMessage: {
      type: new mongoose.Schema(
        {
          // Which message this snapshot is of, so a delete/forward can tell
          // whether IT is the current preview and needs to be recomputed.
          messageId: { type: ObjectId, ref: 'Message' },
          text: String,
          sender: { type: ObjectId, ref: 'User' },
          createdAt: Date,
          // Just enough for a "📷 Photo" preview; null for a text message.
          attachment: {
            type: new mongoose.Schema({ kind: String, name: String }, { _id: false }),
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },
    // How far each participant has read, keyed by their user id (a string,
    // since Map keys are always strings). Only 2 entries ever exist. Read
    // per-conversation rather than per-message: "everything up to this
    // message id is read" needs one small write, not one per message.
    lastRead: {
      type: Map,
      of: new mongoose.Schema({ upTo: ObjectId, at: Date }, { _id: false }),
      default: {},
    },
    // The same idea one step earlier: how far each participant's app has
    // RECEIVED messages (it was online), whether or not they opened the chat.
    // Drives the grey double tick; lastRead drives the blue one.
    lastDelivered: {
      type: Map,
      of: new mongoose.Schema({ upTo: ObjectId, at: Date }, { _id: false }),
      default: {},
    },
    // Participants who muted this chat: messages still arrive as normal,
    // there is just no notification for them.
    mutedBy: { type: [{ type: ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true },
)

export const Conversation = mongoose.model('Conversation', conversationSchema)
