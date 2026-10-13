import crypto from 'node:crypto'

import mongoose from 'mongoose'

import { Attachment } from '../models/Attachment.js'
import { Conversation } from '../models/Conversation.js'
import { Message } from '../models/Message.js'
import { AppError } from '../utils/AppError.js'
import { attachmentView } from './attachmentService.js'
import { assertFriends, assertParticipant } from './friendService.js'
import { getSettings } from './settingsService.js'

function replyToView(replyTo) {
  if (!replyTo) return null
  return {
    messageId: String(replyTo.messageId),
    senderId: String(replyTo.senderId),
    textSnippet: replyTo.textSnippet ?? '',
    attachmentKind: replyTo.attachmentKind ?? null,
  }
}

// A soft-deleted message is never sent with its real text or file
export function messageView(message) {
  if (message.deletedForEveryone) {
    return {
      id: String(message._id),
      conversationId: String(message.conversation),
      senderId: String(message.sender),
      text: '',
      clientId: message.clientId,
      attachment: null,
      replyTo: replyToView(message.replyTo),
      forwarded: message.forwarded ?? false,
      deletedForEveryone: true,
      createdAt: message.createdAt,
    }
  }

  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    text: message.text ?? '',
    clientId: message.clientId,
    attachment: message.attachment ? attachmentView(message.attachment) : null,
    replyTo: replyToView(message.replyTo),
    forwarded: message.forwarded ?? false,
    deletedForEveryone: false,
    createdAt: message.createdAt,
  }
}

// Cursor paging, not skip: new messages arriving would shift skip-based pages
export async function getHistory(meId, conversationId, { before, limit }) {
  const conversation = await assertParticipant(conversationId, meId)

  const filter = { conversation: conversationId, deletedFor: { $ne: meId } }
  if (before) filter._id = { $lt: before }

  const rows = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('attachment')

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit).reverse()

  const otherId = conversation.participants.find((p) => String(p) !== String(meId))
  const theirRead = conversation.lastRead?.get(String(otherId))
  const theirDelivered = conversation.lastDelivered?.get(String(otherId))

  return {
    messages: page.map(messageView),
    hasMore,
    theirReadUpTo: theirRead?.upTo ? String(theirRead.upTo) : null,
    theirDeliveredUpTo: theirDelivered?.upTo ? String(theirDelivered.upTo) : null,
  }
}

// One atomic update whose filter only lets the pointer move forward, so racing tabs can't move it back
export async function markDelivered(recipientId, conversationId, upToMessageId) {
  const path = `lastDelivered.${recipientId}`
  // Mongoose doesn't always cast a path inside a Map, so cast it ourselves
  const upTo = new mongoose.Types.ObjectId(String(upToMessageId))
  const result = await Conversation.updateOne(
    {
      _id: conversationId,
      participants: recipientId,
      $or: [{ [`${path}.upTo`]: { $exists: false } }, { [`${path}.upTo`]: { $lt: upTo } }],
    },
    { $set: { [path]: { upTo, at: new Date() } } },
  )
  return result.modifiedCount > 0
}

export async function catchUpDelivered(userId) {
  const conversations = await Conversation.find({ participants: userId }, { participants: 1 })
  const moved = []

  for (const conversation of conversations) {
    const latestFromThem = await Message.findOne(
      { conversation: conversation._id, sender: { $ne: userId } },
      { _id: 1, sender: 1 },
    ).sort({ _id: -1 })
    if (!latestFromThem) continue

    if (await markDelivered(userId, conversation._id, latestFromThem._id)) {
      moved.push({
        senderId: String(latestFromThem.sender),
        conversationId: String(conversation._id),
        upToMessageId: String(latestFromThem._id),
      })
    }
  }
  return moved
}

export async function markRead(meId, conversationId, upToMessageId) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = conversation.participants.find((p) => String(p) !== String(meId))

  const key = `lastRead.${meId}`
  const current = conversation.lastRead?.get(String(meId))

  // only moves forward; same-length hex ids compare correctly as strings
  if (current?.upTo && String(current.upTo) >= String(upToMessageId)) return null

  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { [key]: { upTo: upToMessageId, at: new Date() } } },
  )
  return String(otherId)
}

async function findExisting(meId, clientId) {
  return Message.findOne({ sender: meId, clientId }).populate('attachment')
}

async function buildReplySnapshot(conversationId, replyToId) {
  if (!replyToId) return null
  const original = await Message.findOne({ _id: replyToId, conversation: conversationId }).populate(
    'attachment',
  )
  if (!original) return null
  return {
    messageId: original._id,
    senderId: original.sender,
    textSnippet: original.deletedForEveryone ? '' : (original.text ?? '').slice(0, 120),
    attachmentKind: original.deletedForEveryone ? null : (original.attachment?.kind ?? null),
  }
}

function lastMessageSnapshot(message, attachment) {
  return {
    messageId: message._id,
    text: message.text,
    sender: message.sender,
    createdAt: message.createdAt,
    attachment: attachment ? { kind: attachment.kind, name: attachment.name } : null,
  }
}

export async function sendMessage(meId, { conversationId, text, clientId, attachmentId, replyToId }) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = String(conversation.participants.find((p) => String(p) !== String(meId)))
  await assertFriends(meId, otherId)

  // a retry after a timeout reuses the clientId, so return the saved one
  const existing = await findExisting(meId, clientId)
  if (existing) return { message: messageView(existing), otherId, created: false }

  const messageId = new mongoose.Types.ObjectId()

  let attachment = null
  if (attachmentId) {
    // One atomic claim: my upload, this chat, not used yet, so it can't be stolen, moved or reused
    attachment = await Attachment.findOneAndUpdate(
      { _id: attachmentId, uploader: meId, conversation: conversationId, message: null },
      { message: messageId },
      { new: true },
    )
    if (!attachment) {
      const retried = await findExisting(meId, clientId)
      if (retried) return { message: messageView(retried), otherId, created: false }
      throw new AppError(404, 'Attachment not found')
    }
  }

  const replyTo = await buildReplySnapshot(conversationId, replyToId)

  let message
  try {
    message = await Message.create({
      _id: messageId,
      conversation: conversationId,
      sender: meId,
      text,
      clientId,
      attachment: attachment?._id ?? null,
      replyTo,
    })
  } catch (err) {
    if (attachment) await Attachment.updateOne({ _id: attachment._id, message: messageId }, { message: null })
    // the unique (sender, clientId) index lets only one of two identical retries through
    if (err.code === 11000) {
      const saved = await findExisting(meId, clientId)
      return { message: messageView(saved), otherId, created: false }
    }
    throw err
  }
  // only if no newer message got there first, so the preview never goes backwards
  await Conversation.updateOne(
    {
      _id: conversationId,
      $or: [{ lastMessage: null }, { 'lastMessage.createdAt': { $lte: message.createdAt } }],
    },
    { lastMessage: lastMessageSnapshot(message, attachment) },
  )

  const view = messageView({ ...message.toObject(), attachment })
  return { message: view, otherId, created: true }
}

function lastMessageClientView(snapshot) {
  if (!snapshot) return null
  return {
    text: snapshot.text,
    senderId: String(snapshot.sender),
    createdAt: snapshot.createdAt,
    attachment: snapshot.attachment,
  }
}

// undefined means "preview unchanged", which is different from null ("no preview left")
async function recomputeLastMessageIfNeeded(conversationId, deletedMessageId) {
  const conversation = await Conversation.findById(conversationId)
  if (!conversation?.lastMessage || String(conversation.lastMessage.messageId) !== String(deletedMessageId)) {
    return undefined
  }

  const replacement = await Message.findOne({ conversation: conversationId, deletedForEveryone: false })
    .sort({ _id: -1 })
    .populate('attachment')

  const snapshot = replacement ? lastMessageSnapshot(replacement, replacement.attachment) : null
  await Conversation.updateOne({ _id: conversationId }, { lastMessage: snapshot })
  return lastMessageClientView(snapshot)
}

export async function deleteMessage(meId, { conversationId, messageId, mode }) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = String(conversation.participants.find((p) => String(p) !== String(meId)))

  const message = await Message.findOne({ _id: messageId, conversation: conversationId })
  if (!message) throw new AppError(404, 'Message not found')

  if (mode === 'everyone') {
    if (String(message.sender) !== String(meId)) {
      throw new AppError(403, 'You can only delete your own messages for everyone')
    }
    const settings = await getSettings()
    const windowMs = settings.deleteForEveryoneWindowMinutes * 60 * 1000
    if (Date.now() - message.createdAt.getTime() > windowMs) {
      throw new AppError(400, 'This message is too old to delete for everyone')
    }
    let lastMessage
    if (!message.deletedForEveryone) {
      message.deletedForEveryone = true
      await message.save()
      lastMessage = await recomputeLastMessageIfNeeded(conversationId, messageId)
    }
    return { otherId, mode, lastMessage }
  }

  await Message.updateOne({ _id: messageId }, { $addToSet: { deletedFor: meId } })
  return { otherId, mode, lastMessage: undefined }
}

export async function forwardMessage(meId, { messageId, toConversationIds }) {
  const settings = await getSettings()
  if (!settings.forwardingEnabled) throw new AppError(403, 'Forwarding is currently disabled')

  const source = await Message.findById(messageId).populate('attachment')
  if (!source) throw new AppError(404, 'Message not found')
  await assertParticipant(source.conversation, meId)
  if (source.deletedForEveryone || source.deletedFor.some((id) => String(id) === String(meId))) {
    throw new AppError(400, 'This message can no longer be forwarded')
  }

  const uniqueTargets = [...new Set(toConversationIds.map(String))]
  const results = []

  for (const conversationId of uniqueTargets) {
    try {
      const conversation = await assertParticipant(conversationId, meId)
      const otherId = String(conversation.participants.find((p) => String(p) !== String(meId)))
      await assertFriends(meId, otherId)

      const newMessageId = new mongoose.Types.ObjectId()

      let attachment = null
      if (source.attachment) {
        attachment = await Attachment.create({
          uploader: meId,
          conversation: conversationId,
          fileId: source.attachment.fileId,
          name: source.attachment.name,
          mimeType: source.attachment.mimeType,
          size: source.attachment.size,
          kind: source.attachment.kind,
          durationMs: source.attachment.durationMs ?? null,
          waveform: source.attachment.waveform?.length ? source.attachment.waveform : undefined,
          message: newMessageId,
        })
      }

      const message = await Message.create({
        _id: newMessageId,
        conversation: conversationId,
        sender: meId,
        text: source.text,
        clientId: crypto.randomUUID(),
        attachment: attachment?._id ?? null,
        forwarded: true,
      })

      await Conversation.updateOne(
        {
          _id: conversationId,
          $or: [{ lastMessage: null }, { 'lastMessage.createdAt': { $lte: message.createdAt } }],
        },
        { lastMessage: lastMessageSnapshot(message, attachment) },
      )

      const view = messageView({ ...message.toObject(), attachment })
      results.push({ conversationId, ok: true, message: view, otherId })
    } catch (err) {
      if (!(err instanceof AppError)) throw err
      results.push({ conversationId, ok: false, error: err.message })
    }
  }

  return results
}

const SHARED_LIMIT = 200

export async function listSharedAttachments(meId, conversationId) {
  await assertParticipant(conversationId, meId)
  const messages = await Message.find({
    conversation: conversationId,
    attachment: { $ne: null },
    deletedForEveryone: false,
    deletedFor: { $ne: meId },
  })
    .sort({ _id: -1 })
    .limit(SHARED_LIMIT)
    .populate('attachment')

  return messages
    .filter((m) => m.attachment)
    .map((m) => ({
      messageId: String(m._id),
      senderId: String(m.sender),
      createdAt: m.createdAt,
      attachment: attachmentView(m.attachment),
    }))
}

export async function clearConversation(meId, conversationId) {
  await assertParticipant(conversationId, meId)
  await Message.updateMany(
    { conversation: conversationId, deletedFor: { $ne: meId } },
    { $addToSet: { deletedFor: meId } },
  )
}

export async function setMuted(meId, conversationId, muted) {
  await assertParticipant(conversationId, meId)
  await Conversation.updateOne(
    { _id: conversationId },
    muted ? { $addToSet: { mutedBy: meId } } : { $pull: { mutedBy: meId } },
  )
  return muted
}
