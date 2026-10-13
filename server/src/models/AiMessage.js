import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const AI_TEXT_MAX = 4000

const aiFileSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: true },
    name: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file'], required: true },
    durationMs: { type: Number, default: null, min: 0, max: 5 * 60 * 1000 },
    waveform: { type: [{ type: Number, min: 0, max: 100 }], default: undefined },
    // The bytes belong to a forwarded chat attachment, so clearing the AI chat must not delete them
    shared: { type: Boolean, default: false },
  },
  { _id: false },
)

const aiMessageSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    // Gemini's own names for the two sides: 'user' asks, 'model' answers
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, default: '' },
    reasoning: { type: String, default: '' },
    mode: { type: String, enum: ['chat', 'think', 'imagine'], default: 'chat' },
    attachment: { type: aiFileSchema, default: null },
    status: { type: String, enum: ['streaming', 'done', 'stopped', 'error'], default: 'done' },
    error: { type: String, default: '' },
    clientId: { type: String },
    forwarded: { type: Boolean, default: false },
  },
  { timestamps: true },
)

aiMessageSchema.index({ user: 1, _id: -1 })
aiMessageSchema.index({ user: 1, role: 1, createdAt: -1 })
// Only questions have a clientId; unique so a retried request is never saved twice
aiMessageSchema.index(
  { user: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
)

export const AiMessage = mongoose.model('AiMessage', aiMessageSchema)
