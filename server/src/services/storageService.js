import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import mongoose from 'mongoose'

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' })
}

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id))

export async function saveFile(buffer, { filename, contentType, metadata = {} }) {
  const upload = bucket().openUploadStream(filename, { metadata: { contentType, ...metadata } })
  await pipeline(Readable.from([buffer]), upload)
  return upload.id
}

export async function getFileInfo(fileId) {
  const file = await bucket().find({ _id: toObjectId(fileId) }).next()
  if (!file) return null
  return { length: file.length, contentType: file.metadata?.contentType }
}

// range.end is inclusive (HTTP Range), but GridFS's end is exclusive
export function openFile(fileId, range) {
  const options = range ? { start: range.start, end: range.end + 1 } : undefined
  return bucket().openDownloadStream(toObjectId(fileId), options)
}

export async function readFile(fileId) {
  const chunks = []
  for await (const chunk of openFile(fileId)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// An already-deleted file is not an error, so cleanup is safe to repeat
export async function deleteFile(fileId) {
  if (!fileId) return
  try {
    await bucket().delete(toObjectId(fileId))
  } catch (err) {
    if (!/file not found/i.test(err.message)) throw err
  }
}
