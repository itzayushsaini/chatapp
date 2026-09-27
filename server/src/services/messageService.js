import mongoose from 'mongoose'

import { Attachment } from '../models/Attachment.js'
import { Conversation } from '../models/Conversation.js'
import { Message } from '../models/Message.js'
import { AppError } from '../utils/AppError.js'
import { attachmentView } from './attachmentService.js'
import { assertFriends, assertParticipant } from './friendService.js'

// The one shape a message has when it leaves the server (REST and sockets).
// `message.attachment` must be populated (the Attachment document) or null.
export function messageView(message) {
  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    text: message.text ?? '',
    clientId: message.clientId,
    attachment: message.attachment ? attachmentView(message.attachment) : null,
    createdAt: message.createdAt,
  }
}

// Keyset ("cursor") pagination: "give me `limit` messages older than
// message X". MongoDB ids grow over time, so `_id < before` means "older".
//
// We never use skip/offset. With skip, a message arriving while you scroll
// shifts every page by one, so you see a message twice or miss one; skip also
// gets slower the further back you go. A cursor has neither problem.
export async function getHistory(meId, conversationId, { before, limit }) {
  await assertParticipant(conversationId, meId)

  const filter = { conversation: conversationId }
  if (before) filter._id = { $lt: before }

  // Fetch one extra row: if it exists, there are older messages to load.
  const rows = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('attachment')

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit).reverse() // oldest -> newest for display

  return { messages: page.map(messageView), hasMore }
}

async function findExisting(meId, clientId) {
  return Message.findOne({ sender: meId, clientId }).populate('attachment')
}

// Saves a message. The ORDER of the checks is the point: nothing is saved
// unless I am in the conversation AND we are still friends. The caller
// (the socket handler) emits and acknowledges only after this returns.
//
// Returns { message, otherId, created }. created is false when this was a
// retry of a message we already have.
export async function sendMessage(meId, { conversationId, text, clientId, attachmentId }) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = String(conversation.participants.find((p) => String(p) !== String(meId)))
  await assertFriends(meId, otherId)

  // Idempotency: the browser retries with the SAME clientId after a timeout.
  // If the first attempt was actually saved, return that one.
  const existing = await findExisting(meId, clientId)
  if (existing) return { message: messageView(existing), otherId, created: false }

  // The message's id is made now so the attachment can be claimed for it.
  const messageId = new mongoose.Types.ObjectId()

  let attachment = null
  if (attachmentId) {
    // Claim the upload in ONE atomic step. The filter is the security check:
    // it must be MY upload, for THIS conversation, and not used by another
    // message yet - so nobody can send someone else's file, move a file into
    // a different chat, or attach one file to two messages.
    attachment = await Attachment.findOneAndUpdate(
      { _id: attachmentId, uploader: meId, conversation: conversationId, message: null },
      { message: messageId },
      { new: true },
    )
    if (!attachment) {
      // Maybe it was claimed by an identical retry that got in first.
      const retried = await findExisting(meId, clientId)
      if (retried) return { message: messageView(retried), otherId, created: false }
      throw new AppError(404, 'Attachment not found')
    }
  }

  let message
  try {
    message = await Message.create({
      _id: messageId,
      conversation: conversationId,
      sender: meId,
      text,
      clientId,
      attachment: attachment?._id ?? null,
    })
  } catch (err) {
    // Release the claim so the upload can still be sent.
    if (attachment) await Attachment.updateOne({ _id: attachment._id, message: messageId }, { message: null })
    // Two copies of the same retry arriving at once: the unique index on
    // (sender, clientId) lets one through; return that one.
    if (err.code === 11000) {
      const saved = await findExisting(meId, clientId)
      return { message: messageView(saved), otherId, created: false }
    }
    throw err
  }
  // Update the sidebar preview - but only if no NEWER message got there
  // first, so two messages sent at the same moment cannot leave the older
  // one as the preview.
  await Conversation.updateOne(
    {
      _id: conversationId,
      $or: [{ lastMessage: null }, { 'lastMessage.createdAt': { $lte: message.createdAt } }],
    },
    {
      lastMessage: {
        text: message.text,
        sender: meId,
        createdAt: message.createdAt,
        attachment: attachment ? { kind: attachment.kind, name: attachment.name } : null,
      },
    },
  )

  // A plain copy with the full attachment in place of its id, for messageView.
  const view = messageView({ ...message.toObject(), attachment })
  return { message: view, otherId, created: true }
}
