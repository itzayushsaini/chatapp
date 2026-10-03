import { useState } from 'react'
import { Link } from 'react-router'

import AnnouncementBanner from '../components/common/AnnouncementBanner.jsx'
import { buttonClass } from '../components/common/buttonClass.js'
import {
  ArrowRightIcon,
  BanIcon,
  BellIcon,
  ChatIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  KeyboardIcon,
  LockIcon,
  MicIcon,
  MoonIcon,
  ReplyIcon,
  SearchIcon,
  ShieldIcon,
  SmartphoneIcon,
  SparklesIcon,
  UserIcon,
  UserPlusIcon,
  ZapIcon,
} from '../components/common/Icons.jsx'
import InstallAppDialog from '../components/common/InstallAppDialog.jsx'
import Logo from '../components/common/Logo.jsx'
import ChatPreview from '../components/landing/ChatPreview.jsx'
import { useInstallApp } from '../hooks/useInstallApp.js'

// The public home page, shown at "/" to anyone who is NOT logged in (a
// logged-in user gets the chat there instead - see App.jsx). It is a plain,
// static page: no API calls of its own and no state, just the app's
// features explained, with links to /register and /login.
//
// Everything it says is something PingMe really does - there is deliberately
// no "voice/video calls" or "end-to-end encryption", because PingMe has
// neither.
//
// Motion is CSS only (index.css): the preview's bubbles appear one by one,
// the phone floats, and cards fade in as you scroll to them (`reveal`). All
// of it switches off for "reduce motion".

const REPO_URL = 'https://github.com/itzayushsaini/chatapp'

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#faq', label: 'FAQ' },
]

const HIGHLIGHTS = [
  {
    icon: ZapIcon,
    title: 'Real-time',
    text: 'Messages, typing and read ticks arrive the instant they happen - no refreshing.',
  },
  {
    icon: LockIcon,
    title: 'Private by username',
    text: 'There is no public list of users. Only someone who knows your exact username can find you.',
  },
  {
    icon: ShieldIcon,
    title: 'Secure',
    text: 'Hashed passwords, a session cookie scripts cannot read, and rate limits on every action.',
  },
]

// The newest, headline feature - one wide card above the other twelve, so
// the grid below stays even at every screen width.
const AI_FEATURE = {
  icon: SparklesIcon,
  title: 'PingMe AI, built in',
  text: 'Your own assistant, powered by Google Gemini. Ask it anything, get help with studies and code, and send it photos, PDFs or voice notes. Watch it reason, tap "Think deeper" for hard questions, or forward it any message to ask about it.',
}

const FEATURES = [
  {
    icon: ChatIcon,
    title: 'Instant messaging',
    text: 'One-to-one chats that update live on every device you are logged in on.',
  },
  {
    icon: CheckCheckIcon,
    title: 'Read receipts',
    text: 'One grey tick when it is sent, two when it is delivered, two blue ones when it has been read.',
  },
  {
    icon: KeyboardIcon,
    title: 'Typing and last seen',
    text: 'See when a friend is typing, whether they are online, or when they were last seen.',
  },
  {
    icon: ImageIcon,
    title: 'Photos, videos and files',
    text: 'Share photos and documents up to 10 MB and videos up to 25 MB, shown right in the chat.',
  },
  {
    icon: MicIcon,
    title: 'Voice notes',
    text: 'Tap the mic, talk, send - up to 5 minutes. Play them back at 1×, 1.5× or 2× with a waveform.',
  },
  {
    icon: ReplyIcon,
    title: 'Reply, forward and delete',
    text: 'Quote a message, forward it to other friends, copy it, or delete it for everyone.',
  },
  {
    icon: UserPlusIcon,
    title: 'Friend requests',
    text: 'You can only chat once someone accepts your request. Decline or cancel any time.',
  },
  {
    icon: BellIcon,
    title: 'Notifications',
    text: 'A pop-up for each new message while PingMe is open in any tab - and mute for busy chats.',
  },
  {
    icon: BanIcon,
    title: 'Block and clear chat',
    text: 'Block someone and they simply cannot find or message you. Clear a chat just for yourself.',
  },
  {
    icon: UserIcon,
    title: 'Your profile',
    text: 'A photo, a display name and a short bio, visible to the people you chat with.',
  },
  {
    icon: MoonIcon,
    title: 'Dark mode',
    text: 'Light, dark or the same as your device - saved to your account, so it follows you.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Works everywhere',
    text: 'Phone, tablet or laptop, in any modern browser. There is nothing to install.',
  },
]

const STEPS = [
  {
    title: 'Create your account',
    text: 'Pick a username - that is how friends will find you. It takes under a minute.',
    demo: <StepSignUp />,
  },
  {
    title: 'Find a friend',
    text: 'Search their exact username and send a request. Nobody can browse the user list.',
    demo: <StepSearch />,
  },
  {
    title: 'Start chatting',
    text: 'Once they accept, your chat opens - messages, files and voice notes, all live.',
    demo: <StepChat />,
  },
]

const PRIVACY_POINTS = [
  'No user directory: partial names and "browse everyone" searches find nothing.',
  'Online status and last seen are shared with friends only.',
  'Blocking is silent - a blocked person just cannot find you, and is not told.',
  'Passwords are hashed with bcrypt and never stored as text.',
  'Your session lives in an httpOnly cookie that page scripts cannot read.',
  'Every upload is checked by its real contents, not by its file name.',
  'Changing your password signs every other device out.',
  'Rate limits stop spam and password guessing.',
]

const FAQS = [
  {
    q: 'Is PingMe free?',
    a: 'Yes. PingMe is a student project built by a team of four at COER University, and it is free to use.',
  },
  {
    q: 'Why can I not search for people by name?',
    a: 'On purpose. If anyone could search by part of a name, anyone could list every user. In PingMe you need a friend’s exact username - so share yours with the people you actually want to hear from.',
  },
  {
    q: 'Can people who are not my friends see when I am online?',
    a: 'No. Whether you are online, and when you were last seen, is only ever sent to your friends.',
  },
  {
    q: 'What can I send?',
    a: 'Text messages up to 2,000 characters, photos (JPEG, PNG, GIF, WebP), videos (MP4, WebM, MOV), documents (PDF, Word, Excel, PowerPoint, ZIP, text) and voice notes up to 5 minutes.',
  },
  {
    q: 'What is PingMe AI?',
    a: 'An assistant you can chat with, pinned at the top of your chats and powered by Google Gemini. Only you can see your chat with it, and it sees nothing from your other chats unless you forward a message to it. What you send it goes to Google to get an answer, so do not share passwords or private details - and like any AI, it can make mistakes.',
  },
  {
    q: 'Can I delete a message I sent by mistake?',
    a: '“Delete for me” works on any message. “Delete for everyone” works on your own messages for a limited time after sending (an hour by default).',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No - PingMe runs in your browser on phones, tablets and laptops. But you can install it as an app (Chrome, Edge or Safari: "Install app" or "Add to Home Screen"): it gets its own icon, opens full screen, and with notifications on it tells you about new messages even while it is closed.',
  },
  {
    q: 'I forgot my password. What now?',
    a: 'Use “Forgot password?” on the login page and we will email you a link to set a new one. The link works once and expires after an hour.',
  },
]

const TECH = ['React', 'Node.js', 'Express', 'MongoDB', 'Socket.IO', 'Tailwind CSS']

export default function LandingPage() {
  return (
    // overflow-x-clip: the decorative blurred blobs and the phone may stick
    // out past the edge; clip them rather than letting the page scroll
    // sideways on a phone. (clip, not hidden, so the sticky header still works.)
    <div className="landing-page min-h-dvh overflow-x-clip bg-slate-50 text-slate-900">
      <AnnouncementBanner />
      <Header />
      <main>
        <Hero />
        <Highlights />
        <Features />
        <HowItWorks />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="PingMe home"
        >
          <Logo small />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            Log in
          </Link>
          <Link to="/register" className={buttonClass({ size: 'sm' })}>
            Sign up
          </Link>
        </div>
      </div>
    </header>
  )
}

// "Install the app" - only where installing works right now: the browser
// has offered it (Chrome, Edge, Android), or on an iPhone/iPad (then it shows
// the Add to Home Screen steps). Already installed, or anywhere else: nothing.
function InstallAppLink() {
  const { state, install } = useInstallApp()
  const [stepsOpen, setStepsOpen] = useState(false)
  if (state !== 'prompt' && state !== 'ios') return null

  return (
    <>
      <button
        type="button"
        onClick={() => (state === 'ios' ? setStepsOpen(true) : install())}
        className="mt-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <SmartphoneIcon className="h-4 w-4" />
        Install the app
      </button>
      <InstallAppDialog open={stepsOpen} onClose={() => setStepsOpen(false)} />
    </>
  )
}

function Hero() {
  return (
    <section className="relative">
      {/* Two soft brand-coloured glows behind the hero - decoration only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-brand-100 opacity-70 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-brand-50 opacity-80 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:pt-20 lg:pb-28">
        <div className="animate-fade-in text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
            New: PingMe is now an app 📱
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-5xl xl:text-[3.5rem] xl:leading-[1.1]">
            Real conversations.
            <span className="block bg-linear-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              In real time.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
            PingMe is a fast, private one-to-one chat app. Nobody can browse who is on it: you find a
            friend by their exact username, send a request, and start chatting once they accept.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link to="/register" className={buttonClass({ size: 'lg', className: 'w-full shadow-lg shadow-brand-600/20 sm:w-auto' })}>
              Get started - it’s free
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
            <Link to="/login" className={buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full sm:w-auto' })}>
              Log in
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500 lg:justify-start">
            {['Free to use', 'No phone number needed', 'Phone and laptop'].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-brand-600" />
                {item}
              </li>
            ))}
          </ul>
          <InstallAppLink />
        </div>

        <ChatPreview />
      </div>
    </section>
  )
}

function Highlights() {
  return (
    <section aria-label="Highlights" className="border-y border-slate-200 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        {HIGHLIGHTS.map((item) => {
          const HighlightIcon = item.icon
          return (
            <div key={item.title} className="reveal flex items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <HighlightIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The small heading block every section below starts with.
function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="reveal mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-slate-600">{text}</p>}
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Features"
          title="Everything a chat app should do"
          text="All the things you expect from a modern messenger - built from scratch, and all of it live."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className="reveal flex flex-col gap-4 rounded-2xl bg-linear-135 from-brand-600 via-teal-600 to-violet-600 p-6 text-white shadow-sm sm:col-span-2 sm:flex-row sm:items-center lg:col-span-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <AI_FEATURE.icon className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{AI_FEATURE.title}</h3>
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">New</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-white/90">{AI_FEATURE.text}</p>
            </div>
          </li>
          {FEATURES.map((feature) => {
            const FeatureIcon = feature.icon
            return (
              <li
                key={feature.title}
                className="reveal group rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-slate-200 transition-[box-shadow,transform] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                  <FeatureIcon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{feature.text}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-slate-200 bg-surface px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps to your first chat"
          text="The friend request is the whole idea: you only ever hear from people you said yes to."
        />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="reveal flex flex-col rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="font-semibold text-slate-900">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.text}</p>
              {/* A tiny picture of that step - decoration, hidden from screen readers. */}
              <div aria-hidden="true" className="mt-5 flex flex-1 items-end">
                <div className="w-full rounded-xl bg-surface p-3 shadow-sm ring-1 ring-slate-200">{step.demo}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function StepSignUp() {
  return (
    <div className="space-y-2 text-xs">
      <div className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-400">Display name</div>
      <div className="rounded-lg border-2 border-brand-500 px-2.5 py-1.5 font-medium text-slate-900">@priya_sharma</div>
      <div className="rounded-lg bg-brand-600 py-1.5 text-center font-medium text-white">Sign up</div>
    </div>
  )
}

function StepSearch() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-900">
        <SearchIcon className="h-3.5 w-3.5 text-slate-400" /> aman_verma
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[10px] font-semibold text-white">
          AV
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">Aman Verma</span>
        <span className="rounded-md bg-brand-600 px-2 py-1 text-[10px] font-medium text-white">Add friend</span>
      </div>
    </div>
  )
}

function StepChat() {
  return (
    <div className="chat-background space-y-1.5 rounded-lg p-2 text-[11px]">
      <div className="flex justify-start">
        <span className="rounded-lg rounded-tl-none bg-surface px-2 py-1 text-slate-900 shadow-sm">Request accepted! 👋</span>
      </div>
      <div className="flex justify-end">
        <span className="inline-flex items-end gap-1 rounded-lg rounded-tr-none bg-brand-100 px-2 py-1 text-slate-900 shadow-sm">
          Hi Aman! <CheckCheckIcon className="h-3 w-3 text-tick-read" />
        </span>
      </div>
    </div>
  )
}

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div className="reveal">
          <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Privacy and security</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Private by design. Secure by default.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Most apps let anyone look you up. PingMe does not: a search only ever matches one exact
            username, so there is no way to scroll through everyone who has an account.
          </p>
          {/* A tiny picture of that rule: a partial name finds nobody. */}
          <div aria-hidden="true" className="mt-8 max-w-sm rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900">
              <SearchIcon className="h-4 w-4 text-slate-400" />
              pri
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <LockIcon className="h-4 w-4" /> No user found
            </p>
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {PRIVACY_POINTS.map((point) => (
            <li key={point} className="reveal flex items-start gap-3 rounded-xl bg-surface p-4 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200">
              <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-slate-200 bg-surface px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        {/* <details> opens and closes by itself - no JavaScript or state. */}
        <div className="mt-10 space-y-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="reveal group rounded-xl bg-slate-50 ring-1 ring-slate-200 open:ring-brand-500/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6">
      {/* A fixed dark green (#01735f) for the gradient's end, not a theme
          colour: dark mode turns emerald-700/brand-700 into LIGHT shades for
          text, which would put white text on a pale card. */}
      <div className="reveal relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-linear-to-br from-brand-600 to-[#01735f] px-6 py-14 text-center text-white shadow-xl sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/10" />
        <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to start chatting?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base text-white/85">
          Create your free account, share your username with a friend, and say hello.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-surface px-6 py-3 text-base font-semibold text-brand-700 shadow-md transition-[background-color,transform] duration-150 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#01735f] focus-visible:outline-none active:scale-[0.97] sm:w-auto"
          >
            Create your account
            <ArrowRightIcon className="h-5 w-5" />
          </Link>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-base font-medium text-white ring-1 ring-white/60 transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:w-auto"
          >
            I already have one
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo small />
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              A private, real-time chat app - a B.Tech CSE 2nd year project, COER University.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="rounded text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
                {item.label}
              </a>
            ))}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              GitHub ↗
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} PingMe team</p>
          <p className="flex flex-wrap items-center gap-1.5">
            Built with
            {TECH.map((name) => (
              <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {name}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  )
}
