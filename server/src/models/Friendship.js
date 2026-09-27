import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// Exactly ONE document per pair of users, for the whole life of their
// relationship: pending -> accepted, or pending -> declined -> pending again.
const friendshipSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },
    requester: { type: ObjectId, ref: 'User', required: true },
    recipient: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], required: true },
    respondedAt: { type: Date },
  },
  { timestamps: true },
)

// "My incoming requests", "my friends" and so on all filter by one side plus
// the status, so these two indexes serve every list query.
friendshipSchema.index({ recipient: 1, status: 1 })
friendshipSchema.index({ requester: 1, status: 1 })

export const Friendship = mongoose.model('Friendship', friendshipSchema)
