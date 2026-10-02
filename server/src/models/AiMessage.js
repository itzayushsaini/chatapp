import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const AI_TEXT_MAX = 4000

// A file in the PingMe AI chat: a photo, document or voice note the user
// sent, or a picture the AI created. Embedded, not a separate Attachment:
// it belongs to exactly one message of exactly one person, and there is no
// "other participant" to check permissions against.
const aiFileSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: true }, // the bytes, in GridFS
    name: { type: String, required: true, maxlength: 200 },
    // Detected from the file's own bytes, like every other upload.
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file'], required: true },
    // Voice notes only, display only - the same as Attachment.
    durationMs: { type: Number, default: null, min: 0, max: 5 * 60 * 1000 },
    waveform: { type: [{ type: Number, min: 0, max: 100 }], default: undefined },
    // true when these bytes belong to a CHAT attachment (a message forwarded
    // from a friend chat) - clearing the AI chat must then leave the file
    // alone, because the chat still shows it.
    shared: { type: Boolean, default: false },
  },
  { _id: false },
)

// One message in a user's private chat with PingMe AI. Only its owner can
// ever see it - there is no friend, conversation or read receipt involved.
const aiMessageSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    // 'user' = what the person asked, 'model' = PingMe AI's answer. The same
    // two words Gemini itself uses for the two sides of a conversation.
    role: { type: String, enum: ['user', 'model'], required: true },
    // A question is checked to be at most AI_TEXT_MAX before it gets here.
    // An answer's length is capped by maxOutputTokens instead.
    text: { type: String, default: '' },
    // The model's "thought summary" - a short description of how it worked
    // the answer out, shown behind "Show reasoning". Answers only.
    reasoning: { type: String, default: '' },
    // How the question was asked: normally, "Think deeper" (more reasoning)
    // or "Imagine" (create a picture).
    mode: { type: String, enum: ['chat', 'think', 'imagine'], default: 'chat' },
    attachment: { type: aiFileSchema, default: null },
    // Answers only: 'streaming' while it is being written, then 'done',
    // 'stopped' (the user pressed Stop) or 'error'.
    status: { type: String, enum: ['streaming', 'done', 'stopped', 'error'], default: 'done' },
    // For status 'error': a sentence that is safe to show the user.
    error: { type: String, default: '' },
    // Questions only: the browser's UUID, so a retried request never saves
    // the same question twice (the same idea as Message.clientId).
    clientId: { type: String },
    // A question that was forwarded from a friend chat.
    forwarded: { type: Boolean, default: false },
  },
  { timestamps: true },
)

// History, newest first (keyset pagination, like chat history).
aiMessageSchema.index({ user: 1, _id: -1 })
// The daily limit counts a user's recent answers.
aiMessageSchema.index({ user: 1, role: 1, createdAt: -1 })
// Only questions have a clientId, so the uniqueness applies to those only.
aiMessageSchema.index(
  { user: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
)

export const AiMessage = mongoose.model('AiMessage', aiMessageSchema)
