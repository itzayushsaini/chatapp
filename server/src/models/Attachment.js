import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const attachmentSchema = new mongoose.Schema(
  {
    uploader: { type: ObjectId, ref: 'User', required: true },
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    fileId: { type: ObjectId, required: true },
    name: { type: String, required: true, maxlength: 200 },
    // Detected from the file's own bytes, never taken from the browser
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file'], required: true },
    // null until a message claims it; an attachment belongs to at most one message
    message: { type: ObjectId, ref: 'Message', default: null },
    // Voice notes only, display only: measured by the sender's browser while recording
    durationMs: { type: Number, default: null, min: 0, max: 5 * 60 * 1000 },
    waveform: {
      type: [{ type: Number, min: 0, max: 100 }],
      default: undefined,
      validate: (v) => !v || v.length <= 64,
    },
  },
  { timestamps: true },
)

attachmentSchema.index({ message: 1, createdAt: 1 })

export const Attachment = mongoose.model('Attachment', attachmentSchema)
