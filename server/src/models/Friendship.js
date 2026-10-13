import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// One document per pair for the whole relationship (pairKey is unique)
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

friendshipSchema.index({ recipient: 1, status: 1 })
friendshipSchema.index({ requester: 1, status: 1 })

export const Friendship = mongoose.model('Friendship', friendshipSchema)
