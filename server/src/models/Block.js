import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// "blocker has blocked blocked". Checked in BOTH directions everywhere it
// matters (see friendService.isBlockedEitherWay): once either person blocks
// the other, neither can find the other by username or send a request.
const blockSchema = new mongoose.Schema(
  {
    blocker: { type: ObjectId, ref: 'User', required: true },
    blocked: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

// One block per direction per pair - blocking twice is simply a no-op.
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true })
blockSchema.index({ blocked: 1 })

export const Block = mongoose.model('Block', blockSchema)
