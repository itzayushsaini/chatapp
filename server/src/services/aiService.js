import { AiMessage } from '../models/AiMessage.js'
import { Message } from '../models/Message.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { cleanFileName } from '../utils/fileName.js'
import { detectFileType } from '../utils/fileType.js'
import { assertParticipant } from './friendService.js'
import { AiError, createImage, isConfigured, streamReply } from './geminiClient.js'
import { getSettings } from './settingsService.js'
import { deleteFile, getFileInfo, readFile, saveFile } from './storageService.js'

// PingMe AI: each user's own private chat with an assistant (Google Gemini).
//
// How one question flows:
//   1. ask() checks the limits, saves the question AND an empty answer
//      (status 'streaming'), and returns both at once (HTTP 202).
//   2. writeAnswer() then runs in the background: it sends the conversation
//      to Gemini and, as the answer streams in, emits 'ai:delta' to the
//      user's own room with the whole answer so far.
//   3. When it ends it saves the final answer and emits 'ai:done'.
// MongoDB stays the source of truth: a tab that missed events simply
// refetches the history, exactly like a chat.

export const AI_FILE_MAX_BYTES = 10 * 1024 * 1024
// What Gemini can read, out of what PingMe accepts as uploads. Not GIF or
// Office documents - Gemini does not read those.
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
// Gemini remembers nothing between requests, so every request carries the
// conversation so far - the last this-many messages of it.
const HISTORY_MESSAGES = 20
// Files are sent as their actual bytes only for the newest few, within a
// size budget (Gemini accepts about 20 MB per request, and base64 makes
// files a third bigger). Older ones are described in a sentence instead.
const INLINE_FILES = 3
const INLINE_BYTES_BUDGET = 12 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

const STILL_ANSWERING = 'PingMe AI is still answering - wait for it, or press Stop'
const TRUNCATED_NOTE = '\n\n*(The answer was cut short because it got too long.)*'

// What the user sees for each reason geminiClient can fail with.
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

// userId -> the AbortController of the answer being written for them right
// now. At most ONE per user at a time. Kept in memory, like presence - part
// of the single-instance design (see README).
const running = new Map()

// ---------------------------------------------------------------------------
// Shapes sent to the client
// ---------------------------------------------------------------------------

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
    // Which saved version this is. The same answer can reach a tab twice -
    // in the HTTP response and in a socket event, in either order - and the
    // client keeps whichever copy is newer.
    updatedAt: message.updatedAt,
  }
}

// The same shape as a chat attachment, so the client can reuse its photo,
// file and voice-note components. The url is our own route, which checks
// on every request that it is the owner asking.
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

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

// Answers that actually happened in the last 24 hours. A failed answer does
// not count, so being unlucky with a busy Gemini never uses up your limit.
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

// The quick checks, run BEFORE an upload is read (see routes/ai.routes.js) -
// someone who is over their limit never makes the server receive a file.
export async function assertCanAsk(meId) {
  if (running.has(String(meId))) throw new AppError(409, STILL_ANSWERING)
  await checkLimits(meId, 'chat')
}

// Takes this user's one "answer in progress" slot. It is taken BEFORE the
// first await, so two requests arriving together can never both get it.
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

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

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

// The same keyset pagination as chat history: newest first in the query,
// one extra row to know whether there are older ones, then oldest -> newest.
export async function getHistory(meId, { before, limit }) {
  const filter = { user: meId }
  if (before) filter._id = { $lt: before }
  const rows = await AiMessage.find(filter).sort({ _id: -1 }).limit(limit + 1)
  const hasMore = rows.length > limit
  return { messages: rows.slice(0, limit).reverse().map(aiMessageView), hasMore }
}

// Only the owner, never anyone else: 404 for every other case, the same as
// a file that does not exist.
export async function getFile(meId, messageId) {
  const message = await AiMessage.findOne({ _id: messageId, user: meId })
  const info = message?.attachment && (await getFileInfo(message.attachment.fileId))
  if (!info) throw new AppError(404, 'File not found')
  const { fileId, mimeType, name, kind } = message.attachment
  // Photos, videos and voice notes play in the page; documents always download.
  return { fileId, size: info.length, mimeType, name, inline: kind !== 'file' }
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

// A question already saved under this clientId (the browser retried the
// request): hand back what was saved, without asking Gemini a second time.
async function alreadyAsked(meId, clientId) {
  const question = await AiMessage.findOne({ user: meId, clientId })
  if (!question) return null
  const answer = await AiMessage.findOne({ user: meId, role: 'model', _id: { $gt: question._id } }).sort({ _id: 1 })
  return { question: aiMessageView(question), answer: answer ? aiMessageView(answer) : null }
}

// Checks an upload BEFORE it is stored. Its type comes from its own bytes,
// like every other upload in the app.
function checkUpload(file) {
  const type = detectFileType(file.buffer, file.originalname)
  if (!type || !READABLE_TYPES.includes(type.mime)) {
    throw new AppError(400, 'PingMe AI can read photos (JPEG, PNG, WebP), PDFs, text files, voice notes and videos')
  }
  if (file.size > AI_FILE_MAX_BYTES) throw new AppError(413, 'File is too large')
  return type
}

// Saves the question and an empty answer, then starts writing the answer.
async function saveAndStart(meId, controller, question) {
  let saved = null
  try {
    saved = await AiMessage.create({ user: meId, role: 'user', ...question })
    const answer = await AiMessage.create({ user: meId, role: 'model', mode: question.mode, status: 'streaming' })
    const views = { question: aiMessageView(saved), answer: aiMessageView(answer) }
    // My other tabs show the question and the empty answer straight away.
    emitToUser(meId, 'ai:new', { messages: [views.question, views.answer] })
    start(meId, answer, controller)
    return views
  } catch (err) {
    running.delete(String(meId))
    if (saved) await AiMessage.deleteOne({ _id: saved._id })
    // The same question sent twice at the same moment.
    if (err.code === 11000) throw new AppError(409, 'This message was already sent')
    throw err
  }
}

// `file` is multer's { buffer, originalname, size }, or undefined.
// `voice` fields (durationMs, waveform) are kept only for a real audio file.
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
    if (attachment) await deleteFile(attachment.fileId) // nothing points at it
    throw err
  }
}

// Forwards a message from one of my friend chats to PingMe AI, as a
// question. The file (if any) is not copied: the AI message points at the
// same bytes, marked `shared`, so clearing the AI chat leaves them alone.
export async function forward(meId, { messageId, clientId }) {
  const settings = await getSettings()
  if (!settings.forwardingEnabled) throw new AppError(403, 'Forwarding is currently disabled')

  const source = await Message.findById(messageId).populate('attachment')
  if (!source) throw new AppError(404, 'Message not found')
  await assertParticipant(source.conversation, meId) // 404 for anyone outside that chat
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

// "Try again" on my latest answer, when it failed. The same question is
// answered again, into the same answer message.
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

// The Stop button. Harmless when nothing is being written.
export function stop(meId) {
  running.get(String(meId))?.abort()
}

// "Clear chat" - also used when an admin deletes the account. Files that
// belong to a friend chat (forwarded) stay, because that chat still shows them.
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

// Answers still 'streaming' when the server starts were cut off by a
// restart or a crash - nothing is writing them any more. Run at startup.
export async function recoverInterrupted() {
  const { modifiedCount } = await AiMessage.updateMany(
    { status: 'streaming' },
    { status: 'error', error: 'PingMe AI was interrupted. Please try again.' },
  )
  return modifiedCount
}

// ---------------------------------------------------------------------------
// Writing the answer (in the background)
// ---------------------------------------------------------------------------

// Not awaited by the request: the HTTP response has already gone back, and
// the answer arrives over the socket. Frees the user's slot however it ends.
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
          // The WHOLE answer so far, not just the new piece: a tab that
          // missed one of these simply catches up with the next one.
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
      // Stopped: keep whatever had arrived, like any chat app's Stop button.
      result = { status: 'stopped', text: sofar.text, reasoning: sofar.reasoning }
    } else {
      // An AiError is Google's side and expected now and then. Anything else
      // is a bug in our code - log it (never the key: it is not in errors).
      if (!(err instanceof AiError)) console.error('PingMe AI failed:', err)
      result = { status: 'error', error: friendlyError(err, answer.mode), text: '', reasoning: '' }
    }
  }

  const saved = await AiMessage.findByIdAndUpdate(answer._id, result, { new: true })
  if (!saved) {
    // The chat was cleared while this was being written.
    if (result.attachment) await deleteFile(result.attachment.fileId)
    return
  }
  emitToUser(meId, 'ai:done', { message: aiMessageView(saved) })
}

// "Imagine": a picture from the question's text - or a change to the photo
// attached to it. Saved to GridFS like any other file.
async function imagine(meId, answer, signal) {
  const question = await AiMessage.findOne({ user: meId, role: 'user', _id: { $lt: answer._id } }).sort({ _id: -1 })
  const photo =
    question?.attachment?.kind === 'image'
      ? { buffer: await readFile(question.attachment.fileId), mimeType: question.attachment.mimeType }
      : null

  const created = await createImage({ prompt: question?.text ?? '', image: photo, signal })

  // Checked by its bytes before it is ever served from our domain, the same
  // as an upload - even though it came from Google.
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

// What PingMe AI is told about itself before every conversation.
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

// The conversation so far, in Gemini's format - every message before this
// answer, up to HISTORY_MESSAGES of them.
async function buildContents(meId, answerId) {
  const recent = await AiMessage.find({ user: meId, _id: { $lt: answerId }, status: { $in: ['done', 'stopped'] } })
    .sort({ _id: -1 })
    .limit(HISTORY_MESSAGES)
  recent.reverse()
  // Cutting the history at 20 may leave an answer first; a conversation
  // should start with a question.
  while (recent[0]?.role === 'model') recent.shift()

  // Which files go in as real bytes: the newest few that fit the budget.
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
    // A stopped answer with nothing in it has nothing to say.
    if (parts.length > 0) contents.push({ role: message.role, parts })
  }
  return contents
}

// A file as its real bytes, or - if it is too old, too big, or gone - a
// sentence saying it was there.
async function filePart(message, asBytes) {
  const file = message.attachment
  if (message.role === 'user' && asBytes) {
    try {
      return { inlineData: { mimeType: file.mimeType, data: (await readFile(file.fileId)).toString('base64') } }
    } catch {
      // The bytes are gone - fall through and describe the file instead.
    }
  }
  if (message.role === 'model') return { text: '[You created a picture here.]' }
  const what = { image: 'a photo', video: 'a video', audio: 'a voice message', file: `a file named "${file.name}"` }
  return { text: `[The user sent ${what[file.kind]} here. It is no longer attached.]` }
}
