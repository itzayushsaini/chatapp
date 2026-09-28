import crypto from 'node:crypto'

import mongoose from 'mongoose'

import { Attachment } from '../models/Attachment.js'
import { Conversation } from '../models/Conversation.js'
import { Message } from '../models/Message.js'
import { AppError } from '../utils/AppError.js'
import { attachmentView } from './attachmentService.js'
import { assertFriends, assertParticipant } from './friendService.js'
import { getSettings } from './settingsService.js'

// A quoted reply is shown as its snapshot from send time (see the model
// comment) - the id lets the client jump to the original if it's still here.
function replyToView(replyTo) {
  if (!replyTo) return null
  return {
    messageId: String(replyTo.messageId),
    senderId: String(replyTo.senderId),
    textSnippet: replyTo.textSnippet ?? '',
    attachmentKind: replyTo.attachmentKind ?? null,
  }
}

// The one shape a message has when it leaves the server (REST and sockets).
// `message.attachment` must be populated (the Attachment document) or null.
//
// A message deleted "for everyone" is a soft delete: the row still exists,
// but every reader is shown the same empty placeholder rather than the
// original text or attachment.
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

// Keyset ("cursor") pagination: "give me `limit` messages older than
// message X". MongoDB ids grow over time, so `_id < before` means "older".
//
// We never use skip/offset. With skip, a message arriving while you scroll
// shifts every page by one, so you see a message twice or miss one; skip also
// gets slower the further back you go. A cursor has neither problem.
export async function getHistory(meId, conversationId, { before, limit }) {
  const conversation = await assertParticipant(conversationId, meId)

  // A message I deleted "for me" is excluded entirely, not just flagged, so
  // it never renders on my screen again. This can make a page come back with
  // fewer than `limit` visible rows even though older history remains -
  // acceptable for a chat this size, and simpler than shifting the cursor to
  // compensate.
  const filter = { conversation: conversationId, deletedFor: { $ne: meId } }
  if (before) filter._id = { $lt: before }

  // Fetch one extra row: if it exists, there are older messages to load.
  const rows = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('attachment')

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit).reverse() // oldest -> newest for display

  const otherId = conversation.participants.find((p) => String(p) !== String(meId))
  const theirRead = conversation.lastRead?.get(String(otherId))
  const theirDelivered = conversation.lastDelivered?.get(String(otherId))

  return {
    messages: page.map(messageView),
    hasMore,
    // How far the OTHER person has read, and how far their app has received,
    // so the client can show the right ticks on my own messages without
    // waiting for a live event.
    theirReadUpTo: theirRead?.upTo ? String(theirRead.upTo) : null,
    theirDeliveredUpTo: theirDelivered?.upTo ? String(theirDelivered.upTo) : null,
  }
}

// Records that `recipientId`'s app has received everything up to
// `upToMessageId` in this conversation. ONE atomic update whose filter is the
// "only moves forward" rule, so two tabs (or a live send racing a reconnect
// catch-up) can never move the pointer backwards. Returns true if it moved.
export async function markDelivered(recipientId, conversationId, upToMessageId) {
  const path = `lastDelivered.${recipientId}`
  // Cast explicitly: a path inside a Map is not always cast automatically.
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

// Called when a user comes online: everything already waiting for them in
// every conversation now counts as delivered. Returns who needs telling -
// [{ senderId, conversationId, upToMessageId }] - for only the pointers that
// actually moved, so reconnecting repeatedly announces nothing new.
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

// Records that I have read up to `upToMessageId` in this conversation.
// Returns the other participant's id, so the caller can tell them, or null
// if this was not actually a step forward (nothing to announce).
export async function markRead(meId, conversationId, upToMessageId) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = conversation.participants.find((p) => String(p) !== String(meId))

  const key = `lastRead.${meId}`
  const current = conversation.lastRead?.get(String(meId))

  // A read pointer only ever moves forward. Comparing by string works
  // because same-length hex ObjectIds sort the same as their timestamps.
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

// Builds the `replyTo` snapshot stored on the new message, or null. Looked up
// scoped to the SAME conversation, so a stray or cross-conversation id is
// simply treated as "no reply" rather than failing the whole send - the
// original may also have been deleted between the user tapping Reply and the
// message actually going out.
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

// Saves a message. The ORDER of the checks is the point: nothing is saved
// unless I am in the conversation AND we are still friends. The caller
// (the socket handler) emits and acknowledges only after this returns.
//
// Returns { message, otherId, created }. created is false when this was a
// retry of a message we already have.
export async function sendMessage(meId, { conversationId, text, clientId, attachmentId, replyToId }) {
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
    { lastMessage: lastMessageSnapshot(message, attachment) },
  )

  // A plain copy with the full attachment in place of its id, for messageView.
  const view = messageView({ ...message.toObject(), attachment })
  return { message: view, otherId, created: true }
}

// The client shape of a sidebar preview - see lastMessageView in
// friendService.js, which this deliberately matches.
function lastMessageClientView(snapshot) {
  if (!snapshot) return null
  return {
    text: snapshot.text,
    senderId: String(snapshot.sender),
    createdAt: snapshot.createdAt,
    attachment: snapshot.attachment,
  }
}

// If the message I just deleted was the conversation's preview, recompute it
// from whatever is now the newest non-deleted message (or clear it to null),
// and return the new preview so the caller can tell connected clients about
// it. Returns undefined (not null) when this message was NOT the preview, so
// the caller can tell "nothing to update" apart from "cleared to nothing".
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

// Deletes a message "for me" (hidden on my devices only) or "for everyone"
// (soft-deleted for both). Returns { otherId, mode, lastMessage } so the
// handler knows who else, if anyone, needs telling, and whether the sidebar
// preview changed. `lastMessage` is only present when it actually changed.
export async function deleteMessage(meId, { conversationId, messageId, mode }) {
  const conversation = await assertParticipant(conversationId, meId)
  const otherId = String(conversation.participants.find((p) => String(p) !== String(meId)))

  const message = await Message.findOne({ _id: messageId, conversation: conversationId })
  if (!message) throw new AppError(404, 'Message not found')

  if (mode === 'everyone') {
    if (String(message.sender) !== String(meId)) {
      throw new AppError(403, 'You can only delete your own messages for everyone')
    }
    // Admin-editable (default 60 minutes) - matches the intent of WhatsApp's
    // own limit: long enough to undo a mistake, short enough that it can't
    // rewrite a conversation's history much later.
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

  // mode === 'me': hides it on my own devices only, never announced to the
  // other participant, and never touches the shared sidebar preview.
  await Message.updateOne({ _id: messageId }, { $addToSet: { deletedFor: meId } })
  return { otherId, mode, lastMessage: undefined }
}

// Copies a message's content into one or more OTHER conversations, as a brand
// new message (own id, own clientId, marked forwarded: true). Each target is
// checked independently, so being unfriended with one recipient doesn't
// block forwarding to the rest.
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
          // A forwarded voice note keeps its length and waveform.
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

// ---------------------------------------------------------------------------
// Contact info panel: shared media and files, clear chat, mute
// ---------------------------------------------------------------------------

const SHARED_LIMIT = 200

// Every photo, video and document sent in this conversation that I can still
// see - nothing deleted for everyone, nothing I deleted (or cleared) for me.
// Newest first. Built from the MESSAGES, not the Attachment collection, so a
// deleted message's file never shows up here.
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

// "Clear chat": every message in the conversation disappears from MY view
// only - exactly "delete for me", applied to all of them in one update. The
// other person keeps their whole history.
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
