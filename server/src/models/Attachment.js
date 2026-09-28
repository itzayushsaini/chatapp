import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

// A file uploaded into a conversation. The bytes live in GridFS (fileId); this
// document holds what we know about them and WHO may see them.
//
// Sending a file is two steps: upload it (this document is created with
// message: null), then send a message that points at it. The server links the
// two and an attachment can only ever belong to ONE message.
const attachmentSchema = new mongoose.Schema(
  {
    uploader: { type: ObjectId, ref: 'User', required: true },
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    fileId: { type: ObjectId, required: true },
    name: { type: String, required: true, maxlength: 200 },
    // Detected from the file's own bytes, never taken from the browser.
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file'], required: true },
    message: { type: ObjectId, ref: 'Message', default: null },
    // Voice notes only, and for DISPLAY only: how long it is and the shape
    // of its waveform (0-100 per bar), both measured by the sender's browser
    // while recording. Many recordings don't state their own length, and
    // working the waveform out on the server would mean decoding audio. The
    // file's type is still checked by its bytes, like any other upload; the
    // worst a dishonest client could do with these two is draw a wrong
    // picture of its own voice note.
    durationMs: { type: Number, default: null, min: 0, max: 5 * 60 * 1000 },
    waveform: {
      type: [{ type: Number, min: 0, max: 100 }],
      default: undefined,
      validate: (v) => !v || v.length <= 64,
    },
  },
  { timestamps: true },
)

// Finds uploads that were never sent, for the hourly cleanup.
attachmentSchema.index({ message: 1, createdAt: 1 })

export const Attachment = mongoose.model('Attachment', attachmentSchema)
