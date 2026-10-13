import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// Checked in both directions (friendService.isBlockedEitherWay)
const blockSchema = new mongoose.Schema(
  {
    blocker: { type: ObjectId, ref: 'User', required: true },
    blocked: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true })
blockSchema.index({ blocked: 1 })

export const Block = mongoose.model('Block', blockSchema)
