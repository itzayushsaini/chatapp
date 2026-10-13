import { AiMessage } from '../models/AiMessage.js'
import { Message } from '../models/Message.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { cleanFileName } from '../utils/fileName.js'
import { detectFileType } from '../utils/fileType.js'
import { assertParticipant } from './friendService.js'
import { AiError, createImage, isConfigured, streamReply } from './geminiClient.js'
import { notifyAiAnswer } from './pushService.js'
import { getSettings } from './settingsService.js'
import { deleteFile, getFileInfo, readFile, saveFile } from './storageService.js'

export const AI_FILE_MAX_BYTES = 10 * 1024 * 1024
const READABLE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]
// Gemini remembers nothing, so each request resends the last 20 messages
const HISTORY_MESSAGES = 20
// Gemini takes about 20 MB per request and base64 adds a third, so 12 MB of files
const INLINE_FILES = 3
const INLINE_BYTES_BUDGET = 12 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

const STILL_ANSWERING = 'PingMe AI is still answering - wait for it, or press Stop'
const TRUNCATED_NOTE = '\n\n*(The answer was cut short because it got too long.)*'

function friendlyError(err, mode) {
  switch (err instanceof AiError ? err.reason : null) {
    case 'busy':
      return 'PingMe AI is busy right now - please try again in a minute.'
    case 'unavailable':
      return mode === 'imagine'
        ? "Creating pictures isn't available on this server's Gemini plan."
        : "PingMe AI isn't available on this server's Gemini plan."
    case 'blocked':
      return "Sorry, PingMe AI can't help with that."
    case 'config':
      return "PingMe AI isn't set up correctly. Please let the admin know."
    case 'bad_request':
      return "PingMe AI couldn't read that. Try rephrasing it, or send a different file."
    case 'empty':
      return "PingMe AI didn't come up with an answer. Please try again."
    case 'no_image':
      return "PingMe AI couldn't create that picture. Try describing it differently."
    default:
      return 'Something went wrong with PingMe AI. Please try again.'
  }
}

const running = new Map()

export function aiMessageView(message) {
  const id = String(message._id)
  return {
    id,
    role: message.role,
    text: message.text,
    reasoning: message.reasoning,
    mode: message.mode,
    status: message.status,
    error: message.error,
    attachment: message.attachment ? fileView(id, message.attachment) : null,
    clientId: message.clientId ?? null,
    forwarded: message.forwarded,
    createdAt: message.createdAt,
    // the same answer can arrive twice (HTTP and socket); the client keeps the newer one
    updatedAt: message.updatedAt,
  }
}

function fileView(messageId, file) {
  const view = {
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    kind: file.kind,
    url: `/api/ai/files/${messageId}`,
  }
  if (file.kind === 'audio') {
    view.durationMs = file.durationMs ?? null
    view.waveform = file.waveform?.length ? [...file.waveform] : null
  }
  return view
}

function countAnswersSince(filter, since = new Date(Date.now() - DAY_MS)) {
  return AiMessage.countDocuments({ ...filter, role: 'model', status: { $ne: 'error' }, createdAt: { $gte: since } })
}

export const countAllAnswersToday = () => countAnswersSince({})

async function checkLimits(meId, mode) {
  const settings = await getSettings()
  if (!isConfigured() || !settings.aiEnabled) throw new AppError(503, 'PingMe AI is turned off right now')
  if (mode === 'imagine' && !settings.aiImageGenerationEnabled) {
    throw new AppError(403, 'Creating pictures is turned off')
  }
  if ((await countAnswersSince({ user: meId })) >= settings.aiDailyLimit) {
    throw new AppError(429, `You have used today's ${settings.aiDailyLimit} PingMe AI messages. Please try again tomorrow.`)
  }
}

// Runs before the upload is read, so a user over the limit can't make us receive a file
export async function assertCanAsk(meId) {
  if (running.has(String(meId))) throw new AppError(409, STILL_ANSWERING)
  await checkLimits(meId, 'chat')
}

// The slot is taken before the first await, so two requests can't both get it
async function reserve(meId, mode) {
  const key = String(meId)
  if (running.has(key)) throw new AppError(409, STILL_ANSWERING)
  const controller = new AbortController()
  running.set(key, controller)
  try {
    await checkLimits(meId, mode)
  } catch (err) {
    running.delete(key)
    throw err
  }
  return controller
}

export async function getSummary(meId) {
  const [settings, latest, usedToday] = await Promise.all([
    getSettings(),
    AiMessage.findOne({ user: meId }).sort({ _id: -1 }),
    countAnswersSince({ user: meId }),
  ])
  return {
    available: isConfigured() && settings.aiEnabled,
    imageGeneration: settings.aiImageGenerationEnabled,
    dailyLimit: settings.aiDailyLimit,
    usedToday,
    latest: latest ? aiMessageView(latest) : null,
  }
}

export async function getHistory(meId, { before, limit }) {
  const filter = { user: meId }
  if (before) filter._id = { $lt: before }
  const rows = await AiMessage.find(filter).sort({ _id: -1 }).limit(limit + 1)
  const hasMore = rows.length > limit
  return { messages: rows.slice(0, limit).reverse().map(aiMessageView), hasMore }
}

// Owner only; anyone else gets the same 404 as a missing file
export async function getFile(meId, messageId) {
  const message = await AiMessage.findOne({ _id: messageId, user: meId })
  const info = message?.attachment && (await getFileInfo(message.attachment.fileId))
  if (!info) throw new AppError(404, 'File not found')
  const { fileId, mimeType, name, kind } = message.attachment
  return { fileId, size: info.length, mimeType, name, inline: kind !== 'file' }
}

async function alreadyAsked(meId, clientId) {
  const question = await AiMessage.findOne({ user: meId, clientId })
  if (!question) return null
  const answer = await AiMessage.findOne({ user: meId, role: 'model', _id: { $gt: question._id } }).sort({ _id: 1 })
  return { question: aiMessageView(question), answer: answer ? aiMessageView(answer) : null }
}

function checkUpload(file) {
  const type = detectFileType(file.buffer, file.originalname)
  if (!type || !READABLE_TYPES.includes(type.mime)) {
    throw new AppError(400, 'PingMe AI can read photos (JPEG, PNG, WebP), PDFs, text files, voice notes and videos')
  }
  if (file.size > AI_FILE_MAX_BYTES) throw new AppError(413, 'File is too large')
  return type
}

async function saveAndStart(meId, controller, question) {
  let saved = null
  try {
    saved = await AiMessage.create({ user: meId, role: 'user', ...question })
    const answer = await AiMessage.create({ user: meId, role: 'model', mode: question.mode, status: 'streaming' })
    const views = { question: aiMessageView(saved), answer: aiMessageView(answer) }
    emitToUser(meId, 'ai:new', { messages: [views.question, views.answer] })
    start(meId, answer, controller)
    return views
  } catch (err) {
    running.delete(String(meId))
    if (saved) await AiMessage.deleteOne({ _id: saved._id })
    if (err.code === 11000) throw new AppError(409, 'This message was already sent')
    throw err
  }
}

export async function ask(meId, { text, clientId, mode, durationMs, waveform }, file) {
  if (!text && !file) throw new AppError(400, 'Write something or add a file')
  if (mode === 'imagine' && !text) throw new AppError(400, 'Describe the picture you want')

  const previous = await alreadyAsked(meId, clientId)
  if (previous) return previous

  const type = file ? checkUpload(file) : null
  if (mode === 'imagine' && type && type.kind !== 'image') {
    throw new AppError(400, 'To change a picture, attach a photo')
  }
  const controller = await reserve(meId, mode)

  let attachment = null
  if (file) {
    const name = cleanFileName(file.originalname)
    let fileId
    try {
      fileId = await saveFile(file.buffer, {
        filename: name,
        contentType: type.mime,
        metadata: { purpose: 'ai', owner: meId },
      })
    } catch (err) {
      running.delete(String(meId))
      throw err
    }
    attachment = {
      fileId,
      name,
      mimeType: type.mime,
      size: file.size,
      kind: type.kind,
      ...(type.kind === 'audio' && { durationMs: durationMs ?? null, waveform: waveform ?? undefined }),
    }
  }

  try {
    return await saveAndStart(meId, controller, { text, mode, attachment, clientId })
  } catch (err) {
    if (attachment) await deleteFile(attachment.fileId)
    throw err
  }
}

// The file isn't copied; it's marked shared so clearing the AI chat won't delete it
export async function forward(meId, { messageId, clientId }) {
  const settings = await getSettings()
  if (!settings.forwardingEnabled) throw new AppError(403, 'Forwarding is currently disabled')

  const source = await Message.findById(messageId).populate('attachment')
  if (!source) throw new AppError(404, 'Message not found')
  await assertParticipant(source.conversation, meId)
  if (source.deletedForEveryone || source.deletedFor.some((id) => String(id) === String(meId))) {
    throw new AppError(400, 'This message can no longer be forwarded')
  }

  const previous = await alreadyAsked(meId, clientId)
  if (previous) return previous

  let attachment = null
  if (source.attachment) {
    const file = source.attachment
    if (!READABLE_TYPES.includes(file.mimeType)) throw new AppError(400, "PingMe AI can't read this kind of file")
    if (file.size > AI_FILE_MAX_BYTES) throw new AppError(413, 'This file is too large for PingMe AI')
    attachment = {
      fileId: file.fileId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      kind: file.kind,
      durationMs: file.durationMs ?? null,
      waveform: file.waveform?.length ? file.waveform : undefined,
      shared: true,
    }
  }

  const controller = await reserve(meId, 'chat')
  return saveAndStart(meId, controller, { text: source.text, mode: 'chat', attachment, clientId, forwarded: true })
}

export async function retry(meId) {
  const latest = await AiMessage.findOne({ user: meId, role: 'model' }).sort({ _id: -1 })
  if (latest?.status !== 'error') throw new AppError(400, 'There is nothing to try again')

  const controller = await reserve(meId, latest.mode)
  try {
    const answer = await AiMessage.findOneAndUpdate(
      { _id: latest._id, status: 'error' },
      { status: 'streaming', error: '', text: '', reasoning: '' },
      { new: true },
    )
    if (!answer) throw new AppError(400, 'There is nothing to try again')
    const view = aiMessageView(answer)
    emitToUser(meId, 'ai:new', { messages: [view] })
    start(meId, answer, controller)
    return view
  } catch (err) {
    running.delete(String(meId))
    throw err
  }
}

export function stop(meId) {
  running.get(String(meId))?.abort()
}

export async function clearHistory(meId) {
  stop(meId)
  const withOwnFiles = await AiMessage.find(
    { user: meId, attachment: { $ne: null }, 'attachment.shared': { $ne: true } },
    { attachment: 1 },
  )
  await AiMessage.deleteMany({ user: meId })
  for (const message of withOwnFiles) await deleteFile(message.attachment.fileId)
  emitToUser(meId, 'ai:cleared', {})
}

export async function recoverInterrupted() {
  const { modifiedCount } = await AiMessage.updateMany(
    { status: 'streaming' },
    { status: 'error', error: 'PingMe AI was interrupted. Please try again.' },
  )
  return modifiedCount
}

function start(meId, answer, controller) {
  writeAnswer(meId, answer, controller.signal)
    .catch((err) => console.error('PingMe AI: saving the answer failed:', err))
    .finally(() => {
      if (running.get(String(meId)) === controller) running.delete(String(meId))
    })
}

async function writeAnswer(meId, answer, signal) {
  const id = String(answer._id)
  let sofar = { text: '', reasoning: '' }
  let result

  try {
    if (answer.mode === 'imagine') {
      result = await imagine(meId, answer, signal)
    } else {
      const reply = await streamReply({
        contents: await buildContents(meId, answer._id),
        systemInstruction: systemInstruction(),
        thinkDeeper: answer.mode === 'think',
        signal,
        onUpdate: (partial) => {
          sofar = partial
          // the whole answer so far, so a missed event does no harm
          emitToUser(meId, 'ai:delta', { id, ...partial })
        },
      })
      result = {
        status: 'done',
        text: reply.truncated ? reply.text + TRUNCATED_NOTE : reply.text,
        reasoning: reply.reasoning,
      }
    }
  } catch (err) {
    if (signal.aborted) {
      result = { status: 'stopped', text: sofar.text, reasoning: sofar.reasoning }
    } else {
      if (!(err instanceof AiError)) console.error('PingMe AI failed:', err)
      result = { status: 'error', error: friendlyError(err, answer.mode), text: '', reasoning: '' }
    }
  }

  const saved = await AiMessage.findByIdAndUpdate(answer._id, result, { new: true })
  if (!saved) {
    if (result.attachment) await deleteFile(result.attachment.fileId)
    return
  }
  emitToUser(meId, 'ai:done', { message: aiMessageView(saved) })
  if (saved.status === 'done') notifyAiAnswer(meId, saved)
}

async function imagine(meId, answer, signal) {
  const question = await AiMessage.findOne({ user: meId, role: 'user', _id: { $lt: answer._id } }).sort({ _id: -1 })
  const photo =
    question?.attachment?.kind === 'image'
      ? { buffer: await readFile(question.attachment.fileId), mimeType: question.attachment.mimeType }
      : null

  const created = await createImage({ prompt: question?.text ?? '', image: photo, signal })

  // check the bytes like any upload before serving it from our domain
  const type = detectFileType(created.image.buffer)
  if (type?.kind !== 'image') throw new AiError('no_image')
  const name = `pingme-ai.${type.mime.split('/')[1]}`
  const fileId = await saveFile(created.image.buffer, {
    filename: name,
    contentType: type.mime,
    metadata: { purpose: 'ai', owner: meId },
  })
  return {
    status: 'done',
    text: created.text.trim(),
    reasoning: '',
    attachment: { fileId, name, mimeType: type.mime, size: created.image.buffer.length, kind: 'image' },
  }
}

function systemInstruction() {
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
  return [
    'You are PingMe AI, the assistant built into PingMe, a chat app made by a team of B.Tech CSE students at COER University.',
    `Today is ${today}.`,
    'Be friendly, clear and to the point. Reply in the language the user writes in - Hindi, Hinglish and English are all fine.',
    'Use simple Markdown when it helps: **bold**, lists, tables and code blocks. Keep answers short unless the user asks for detail.',
    'When the user sends a photo, document or voice message, use it to answer. For a voice message on its own, reply to what was said in it.',
    "You cannot browse the internet, see the user's other chats (unless they forward a message to you), send messages or make calls - say so plainly if asked. Never claim to be human.",
  ].join('\n')
}

async function buildContents(meId, answerId) {
  const recent = await AiMessage.find({ user: meId, _id: { $lt: answerId }, status: { $in: ['done', 'stopped'] } })
    .sort({ _id: -1 })
    .limit(HISTORY_MESSAGES)
  recent.reverse()
  while (recent[0]?.role === 'model') recent.shift()

  const asBytes = new Set()
  let budget = INLINE_BYTES_BUDGET
  for (const message of [...recent].reverse()) {
    const file = message.attachment
    if (message.role !== 'user' || !file || asBytes.size >= INLINE_FILES) continue
    if (file.size > budget || !READABLE_TYPES.includes(file.mimeType)) continue
    asBytes.add(String(message._id))
    budget -= file.size
  }

  const contents = []
  for (const message of recent) {
    const parts = []
    if (message.forwarded) {
      parts.push({ text: '(The user forwarded this message to you from one of their chats.)' })
    }
    if (message.attachment) parts.push(await filePart(message, asBytes.has(String(message._id))))
    if (message.text) parts.push({ text: message.text })
    if (parts.length > 0) contents.push({ role: message.role, parts })
  }
  return contents
}

async function filePart(message, asBytes) {
  const file = message.attachment
  if (message.role === 'user' && asBytes) {
    try {
      return { inlineData: { mimeType: file.mimeType, data: (await readFile(file.fileId)).toString('base64') } }
    } catch {
      // file is gone, describe it instead
    }
  }
  if (message.role === 'model') return { text: '[You created a picture here.]' }
  const what = { image: 'a photo', video: 'a video', audio: 'a voice message', file: `a file named "${file.name}"` }
  return { text: `[The user sent ${what[file.kind]} here. It is no longer attached.]` }
}
