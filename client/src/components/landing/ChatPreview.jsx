import Avatar from '../common/Avatar.jsx'
import {
  BackIcon,
  CheckCheckIcon,
  MicIcon,
  PaperclipIcon,
  PlayIcon,
  SearchIcon,
} from '../common/Icons.jsx'
import TypingDots from '../common/TypingDots.jsx'

// The picture of PingMe on the home page: a laptop window and a phone,
// each showing a chat. It is NOT a screenshot - it is built from the same
// colours, bubble shapes, ticks and avatars as the real app, so it follows
// dark mode automatically and can never go out of date with the design.
//
// It is only a picture: nothing in it can be clicked, and the whole thing is
// hidden from screen readers (aria-hidden) and described in one sentence
// instead. The people in it are made up.
//
// The bubbles appear one after another (`landing-pop`, delayed by --delay),
// and the ticks on my messages turn blue a moment later (`landing-tick`) -
// both CSS only, see index.css, and both skipped for "reduce motion".

const AMAN = { username: 'aman_verma', displayName: 'Aman Verma' }
const SNEHA = { username: 'sneha.k', displayName: 'Sneha Kapoor' }

const CHATS = [
  { user: AMAN, preview: 'typing…', time: '10:32', online: true, typing: true },
  { user: SNEHA, preview: '🎤 Voice message', time: '10:15', online: true, unread: 2 },
  { user: { username: 'rahul_dev', displayName: 'Rahul Singh' }, preview: 'See you tomorrow!', time: 'Yesterday', online: false },
  { user: { username: 'priya_s', displayName: 'Priya Sharma' }, preview: '📷 Photo', time: 'Mon', online: false },
]

// A made-up voice-note shape (0-100), like a real one's saved waveform.
const WAVEFORM = [30, 55, 80, 45, 90, 60, 35, 70, 95, 50, 40, 75, 60, 30, 55, 85, 45, 65, 35, 50, 70, 40]

export default function ChatPreview() {
  return (
    // sm:pb-56 makes room for the phone, which hangs below the laptop window.
    <div className="relative mx-auto w-full max-w-xl sm:pb-60 lg:max-w-none">
      <p className="sr-only">
        A preview of PingMe: a list of chats, and a conversation with messages, blue read ticks, a
        voice note and a friend typing.
      </p>
      <div aria-hidden="true" className="select-none">
        {/* The laptop window - from `sm` up. On a phone-sized screen only the
            phone is shown, big enough to read. */}
        <div className="hidden overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-slate-200 sm:ml-14 sm:block">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 rounded-md bg-surface px-3 py-0.5 text-[10px] text-slate-500">PingMe</span>
          </div>
          <div className="flex h-[22rem]">
            <ChatList />
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatHeader user={AMAN} status={<>typing <TypingDots /></>} typing />
              <div className="chat-background flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-3">
                <Bubble delay={0.3} time="10:30">
                  Hey! Are you coming to the project review? 📚
                </Bubble>
                <Bubble mine delay={0.9} time="10:31">
                  Yes! Just finishing the slides 🙌
                </Bubble>
                <Bubble mine delay={1.5} time="10:31">
                  <VoiceNote mine />
                </Bubble>
                <Bubble delay={2.1} time="10:32">
                  Perfect, see you there 👍
                </Bubble>
                <TypingBubble delay={2.7} />
              </div>
              <Composer />
            </div>
          </div>
        </div>

        {/* The phone - on its own on small screens. From `sm` up it overlaps
            the laptop window's bottom-left corner, where the chat list has
            empty space below its four chats - NOT the right side, where it
            would hide "my" bubbles and their ticks. It gently floats. */}
        <div className="animate-float relative mx-auto w-60 sm:absolute sm:top-72 sm:left-0 sm:w-44">
          <div className="overflow-hidden rounded-[2rem] border-[6px] border-neutral-800 bg-surface shadow-2xl">
            <div className="mx-auto mt-1.5 h-1.5 w-12 rounded-full bg-neutral-800" />
            <div className="flex h-[26rem] flex-col sm:h-[20rem]">
              <ChatHeader user={SNEHA} status="Online" back />
              <div className="chat-background flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-2.5">
                <Bubble delay={0.6} time="10:14" photo>
                  Our demo setup for tomorrow 🎉
                </Bubble>
                <Bubble mine delay={1.2} time="10:15" reply={{ name: 'Sneha Kapoor', text: 'Our demo setup for tomorrow 🎉' }}>
                  Looks amazing! 😍
                </Bubble>
                <Bubble delay={1.8} time="10:15">
                  <VoiceNote />
                </Bubble>
              </div>
              <Composer compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatList() {
  return (
    <div className="flex w-44 shrink-0 flex-col border-r border-slate-200 bg-surface lg:w-48">
      <div className="p-2">
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-400">
          <SearchIcon className="h-3 w-3" /> Search chats
        </div>
      </div>
      {CHATS.map((chat, i) => (
        <div
          key={chat.user.username}
          className={`flex items-center gap-2 px-2 py-1.5 ${i === 0 ? 'bg-slate-100' : ''}`}
        >
          <Avatar user={chat.user} size="sm" online={chat.online} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[11px] font-semibold text-slate-900">{chat.user.displayName}</span>
              <span className="shrink-0 text-[9px] text-slate-400">{chat.time}</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className={`truncate text-[10px] ${chat.typing ? 'text-emerald-600' : 'text-slate-500'}`}>
                {chat.preview}
              </span>
              {chat.unread && (
                <span className="rounded-full bg-brand-600 px-1.5 text-[9px] font-semibold text-white">
                  {chat.unread}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatHeader({ user, status, typing = false, back = false }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-surface px-2.5 py-2">
      {back && <BackIcon className="h-3.5 w-3.5 text-slate-500" />}
      <Avatar user={user} size="sm" online />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-900">{user.displayName}</p>
        <p className={`flex items-center gap-1 text-[10px] ${typing ? 'text-emerald-600' : 'text-slate-500'}`}>
          {status}
        </p>
      </div>
    </div>
  )
}

function Bubble({ mine = false, delay, time, photo = false, reply, children }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`landing-pop max-w-[85%] rounded-lg px-2 py-1 text-[11px] leading-snug text-slate-900 shadow-sm ${
          mine ? 'bubble-tail-mine rounded-tr-none bg-brand-100' : 'bubble-tail-theirs rounded-tl-none bg-surface'
        }`}
        style={{ '--delay': `${delay}s` }}
      >
        {photo && <PhotoThumb />}
        {reply && (
          <div className="mb-1 rounded border-l-[3px] border-brand-500 bg-overlay/5 px-1.5 py-0.5 text-[9px]">
            <p className="font-medium text-brand-700">{reply.name}</p>
            <p className="truncate text-slate-600">{reply.text}</p>
          </div>
        )}
        {children}
        <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[9px] text-meta">
          {time}
          {mine && <CheckCheckIcon className="landing-tick h-3 w-3 text-tick-read" />}
        </span>
      </div>
    </div>
  )
}

function TypingBubble({ delay }) {
  return (
    <div className="flex justify-start">
      <div
        className="landing-pop bubble-tail-theirs rounded-lg rounded-tl-none bg-surface px-3 py-2.5 text-slate-400 shadow-sm"
        style={{ '--delay': `${delay}s` }}
      >
        <TypingDots />
      </div>
    </div>
  )
}

// A stand-in "photo": a little landscape drawn with CSS and one SVG path.
function PhotoThumb() {
  return (
    <div className="relative mb-1 h-20 overflow-hidden rounded-md bg-linear-to-br from-sky-300 to-brand-300">
      <span className="absolute top-2.5 right-3 h-4 w-4 rounded-full bg-amber-200" />
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-10 w-full">
        <path d="M0 40 L0 25 L25 8 L45 26 L62 14 L100 34 L100 40 Z" fill="rgb(0 0 0 / 0.18)" />
      </svg>
    </div>
  )
}

function VoiceNote({ mine = false }) {
  return (
    <span className="flex w-36 max-w-full items-center gap-1.5 py-0.5">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <PlayIcon className="ml-px h-2.5 w-2.5" />
      </span>
      <span className="flex h-5 min-w-0 flex-1 items-center gap-px">
        {WAVEFORM.map((height, i) => (
          <span
            key={i}
            className={`min-w-px flex-1 rounded-full ${i < 8 ? (mine ? 'bg-slate-700' : 'bg-brand-600') : 'bg-slate-400/60'}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </span>
      <span className="shrink-0 text-[9px] text-meta">0:12</span>
    </span>
  )
}

function Composer({ compact = false }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5 text-[10px] text-slate-400">
        <PaperclipIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{compact ? 'Message' : 'Type a message'}</span>
      </div>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <MicIcon className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}
