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
  },
  { timestamps: true },
)

export const Conversation = mongoose.model('Conversation', conversationSchema)
