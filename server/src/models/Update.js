import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const UPDATE_TEXT_MAX = 1000

// Its own collection, not messages from a fake "PingMe" user, so the friend rules need no exceptions
const updateSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, maxlength: UPDATE_TEXT_MAX, default: '' },
    imageFileId: { type: ObjectId, default: null },
    // Never sent to users: to them every post comes from "PingMe"
    author: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

updateSchema.pre('validate', function () {
  if (!this.text && !this.imageFileId) this.invalidate('text', 'An update needs text or a photo')
})

export const Update = mongoose.model('Update', updateSchema)
