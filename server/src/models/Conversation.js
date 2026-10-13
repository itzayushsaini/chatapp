import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const conversationSchema = new mongoose.Schema(
  {
    // Sorted, so a pair always has the same order
    participants: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: (v) => v.length === 2,
    },
    // Unique, so a pair's conversation is reused if they unfriend and re-friend
    pairKey: { type: String, required: true, unique: true },
    lastMessage: {
      type: new mongoose.Schema(
        {
          // Lets a delete tell whether this message is the current preview
          messageId: { type: ObjectId, ref: 'Message' },
          text: String,
          sender: { type: ObjectId, ref: 'User' },
          createdAt: Date,
          attachment: {
            type: new mongoose.Schema({ kind: String, name: String }, { _id: false }),
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },
    // Keyed by user id: how far each participant has read (blue ticks)
    lastRead: {
      type: Map,
      of: new mongoose.Schema({ upTo: ObjectId, at: Date }, { _id: false }),
      default: {},
    },
    // How far each participant's app has received messages (grey double tick)
    lastDelivered: {
      type: Map,
      of: new mongoose.Schema({ upTo: ObjectId, at: Date }, { _id: false }),
      default: {},
    },
    mutedBy: { type: [{ type: ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true },
)

export const Conversation = mongoose.model('Conversation', conversationSchema)
