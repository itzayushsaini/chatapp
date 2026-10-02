import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import mongoose from 'mongoose'

// The ONLY file that knows where uploaded bytes actually live.
//
// We use GridFS: MongoDB's built-in way to store files bigger than a normal
// document (16 MB), by splitting them into 255 kB chunks in two collections,
// uploads.files (name, size, type) and uploads.chunks (the bytes).
//
// Keeping it behind these few functions means that moving to cloud storage
// later (S3, Cloudinary...) would only change this one file.

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' })
}

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id))

// Stores a file and returns its GridFS id.
export async function saveFile(buffer, { filename, contentType, metadata = {} }) {
  const upload = bucket().openUploadStream(filename, { metadata: { contentType, ...metadata } })
  await pipeline(Readable.from([buffer]), upload)
  return upload.id
}

// { length, contentType } or null if the file does not exist.
export async function getFileInfo(fileId) {
  const file = await bucket().find({ _id: toObjectId(fileId) }).next()
  if (!file) return null
  return { length: file.length, contentType: file.metadata?.contentType }
}

// A readable stream of the file, or of just the bytes [start, end] (both
// inclusive) - used for video seeking. GridFS's own `end` is exclusive.
export function openFile(fileId, range) {
  const options = range ? { start: range.start, end: range.end + 1 } : undefined
  return bucket().openDownloadStream(toObjectId(fileId), options)
}

// The whole file as one Buffer - for handing a (small, size-checked) file to
// PingMe AI, which needs the bytes themselves rather than a stream.
export async function readFile(fileId) {
  const chunks = []
  for await (const chunk of openFile(fileId)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// Deleting something that is already gone is not an error - the result is
// the same, and it makes cleanup safe to repeat.
export async function deleteFile(fileId) {
  if (!fileId) return
  try {
    await bucket().delete(toObjectId(fileId))
  } catch (err) {
    if (!/file not found/i.test(err.message)) throw err
  }
}
