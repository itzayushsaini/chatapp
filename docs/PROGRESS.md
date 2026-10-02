# Progress

A new session should be able to read this file and carry on from it.

Last updated: 2026-10-02 (Phase 20: PingMe updates channel - done and committed. Next: Phase 21, PingMe AI with Google Gemini - agreed in principle: `gemini-3.8-flash` free tier, `@google/genai`, key in `GEMINI_API_KEY`; plan to be shown before coding)

---

## Phase checklist

| Phase | Scope | Status |
|---|---|---|
| 1 | Project skeleton: workspaces, Express app, env validation, health route, error handling, Vite + Tailwind client, first tests | **Done** |
| 2 | Auth: User model, register / login / logout / me, JWT cookie, `requireAuth`, rate limits | **Done** |
| 3 | Friend system: Friendship model, exact username search, requests, accept / decline / cancel / unfriend, `assertFriends` and `assertParticipant` | **Done** |
| 4 | Conversations and message history REST endpoint (keyset pagination) | **Done** |
| 5 | Socket.IO: handshake auth, rooms, presence counting, `message:send` with ack, socket rate limit | **Done** |
| 6 | Client: auth pages, `AuthContext`, protected routing | **Done** |
| 7 | Client: sidebar tabs (Chats, Requests, Add Friend) | **Done** |
| 8 | Client: chat window, optimistic sending, socket events, reconnection | **Done** |
| 9 | Polish: Playwright end-to-end tests, seed script, deployment, diagrams, final docs | **Done** - deployed live on Render + Atlas |
| 10 | Profiles: picture (GridFS), bio, display name, username change (once per 30 days), live `user:updated` | **Done** |
| 11 | Attachments: photos, videos, documents - upload, magic-byte type check, permission-checked download with Range, cleanup, chat UI | **Done** |
| 12 | Forgot password (Brevo email) and change password (from profile), with cross-device session invalidation | **Done** |
| 13 | Read receipts (blue double tick) and a full WhatsApp-style visual reskin (green theme, bubble layout, doodle background, pill composer, sidebar top bar) | **Done** |
| 14 | Message actions: reply (quoted preview), delete for me / delete for everyone (1-hour window), copy, forward (multi-select) | **Done** |
| 15 | Admin panel: database-backed settings (Gmail-only sign-up, feature toggles, announcement banner), user management (suspend/delete), live stats, `isAdmin` accounts | **Done** |
| 16a | Remember me, confirm password, logout confirmation, error screen, delivered (grey double) ticks, typing indicator, browser notifications | **Done** |
| 16b | Google sign-in, Contact info panel (media, shared files, block, clear chat, mute), Settings page, real dark mode, Enter-to-send switch | **Done** (code + tests). Google sign-in stays hidden until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set - see Known issues 16 |
| 17 | Visual polish: entrance/hover/press animations (message bubbles, dialogs, toasts, banners, buttons), an animated typing indicator, and tuned responsive breakpoints - CSS only, no new dependency | **Done** |
| 18 | Voice notes: record (tap to start, swipe left / trash / Escape to cancel, 5-minute limit), send as an `audio` attachment, waveform player with seeking and 1× / 1.5× / 2× speed, "Voice messages" in Contact info | **Done** |
| 19 | Public home page at `/` for logged-out visitors: hero with an animated chat preview, highlights, 12 features, how it works, privacy and security, FAQ, call to action, footer - CSS-only motion, dark mode, phone to desktop | **Done** |
| 20 | "PingMe" updates channel (like WhatsApp's own chat): a pinned, read-only chat at the top of everyone's Chats list; admins post text and/or a photo from a new Admin "Updates" tab; live delivery, unread badge, notification; forward-only read pointer per user | **Done** |
| 21 | PingMe AI (like Meta AI) with Google Gemini | **Next** - planned, not started |

**Verification (2026-10-02, after Phase 20):** `npm test` 303/303 (20 new in
`updates.test.js`: admin-only posting with no file received from anyone
else, text / photo / both, empty and over-long posts, a photo checked by its
bytes (SVG and a PDF named .png refused, nothing stored), keyset paging,
photo download (auth, real type, inline, cached), the summary's unread
count, the forward-only read pointer, delete removing the photo, and the
live `update:new` / `update:deleted` / `updates:read` events reaching the
right people), `npm run test:e2e` 29/29 (2 new in `updates.spec.js`: a real
admin posts from the Admin panel, an already-online user sees the badge and
preview live, opens the channel, has no message box, the badge clears and
stays cleared after a reload, and a delete disappears live; a non-admin gets
403), lint clean, build succeeds. Checked visually on an isolated server:
the pinned row with an unread badge, the channel with a photo post and a
post arriving live, the admin tab, dark mode, and an iPhone-sized screen
(no sideways overflow).

**Verification (2026-09-28, after Phase 19):** `npm test` 283/283 (no server
change), `npm run test:e2e` 27/27 (4 new in `landing.spec.js`; the
logged-out test in `chat.spec.js`, the logout test and the "other devices
are signed out" test in `password.spec.js` updated for the new `/`), lint
clean, build succeeds. The password test now triggers the 401 from the chat
page at `/` and was confirmed to FAIL without `clearSession`'s redirect to
`/login` (it landed on the home page). Checked visually on an isolated
server at 1440, 1180, 768, 390 and 320px wide, light and dark: nothing wider
than the screen, the preview's phone never covers the laptop window's
messages, cards fade in on scroll, FAQ opens.

**Verification (2026-09-28, after Phase 18):** `npm test` 283/283 (22 new:
the three recording formats detected as audio by their bytes, a WebM / MP4
with a picture track still a video, Ogg Theora refused, voice metadata
stored / validated / ignored on non-audio, the 10 MB limit, inline download,
and a forwarded voice note keeping its length and waveform), `npm run
test:e2e` 21/21 (2 new in `voiceNotes.spec.js`, using Chromium's fake
microphone, so a REAL MediaRecorder recording goes through the real upload
and the server's byte check), lint clean, build succeeds. Checked visually on
an isolated server in light and dark mode and at 390×844: the recording bar,
sent and received waveform bubbles (one mid-playback at 1.5×), and the
"Voice messages" section in Contact info.

**Verification (2026-09-28, after Phase 17):** `npm test` 261/261 pass
(unaffected - purely a client visual change), `npm run test:e2e` 18/18 pass,
lint clean, `npm run build` succeeds. Checked visually on an isolated
in-memory server: message bubbles slide in only for genuinely new messages
(never replayed for the initial page of history or for older messages
loaded by scrolling up); the typing indicator's three dots animate in both
the chat header and the Chats row; dialogs (profile, confirm, contact info)
fade and scale in on open; toasts, the announcement banner and the
reconnecting banner all animate in instead of popping; buttons give a
tactile press-scale; checked in both light and dark mode and at a mobile
viewport (390×844) - no layout regressions.

**Round-two verification (same day):** `npm test` 261/261, `npm run test:e2e`
18/18, lint clean, build succeeds. Checked visually: the message bubble tail
renders correctly on both outgoing and incoming text bubbles (and is
correctly absent on attachment bubbles); the selected Chats row shows a
left accent bar; the login/register page has a soft two-corner background;
Settings cards lift on hover; the message-history skeleton appears correctly
on a brand-new chat's first load, before real messages arrive.

**Bugfix (same day): the team reported the Admin panel and Register page
could no longer scroll**, forcing them to zoom the whole browser out just
to reach a Save button below the fold. Root cause: the scroll-chaining fix
two commits earlier (`Fix: scrolling a chat could still scroll the whole
page`) set `overflow: hidden` on `html`/`body` GLOBALLY to stop the chat
message list from scroll-chaining onto the page - but html/body are shared
by every page, including ones that are NOT the fixed-viewport chat shell
(the admin panel, login/register) and deliberately rely on ordinary page
scrolling when their content is taller than the viewport (`min-h-dvh`, not
`h-dvh`, is exactly that signal). The fix is now scoped to
`LoggedInLayout.jsx`'s own root element (the actual `h-dvh` chat shell)
instead of html/body, so it stops chat scroll-chaining without touching any
other page's ability to scroll. A new regression test
(`e2e/pageScroll.spec.js`) opens Register at a short viewport and asserts
the page itself can still scroll to reach the Sign up button - confirmed it
fails on the over-broad fix and passes after narrowing it, while the
original chat no-scroll-chaining test (`chat.spec.js`) still passes
unchanged, proving both are satisfied at once. `npm test` 261/261,
`npm run test:e2e` 19/19 (1 new), lint clean, build succeeds.

**Follow-up (same day): the Admin panel's own header and tabs scrolled away
too.** The fix above correctly restored page-level scrolling on the Admin
panel, but `AdminPage.jsx` had never had a header/tabs pinned in place while
its content scrolls - it was one plain `min-h-dvh` page in normal document
flow, so once scrolling worked again, the header and Overview/Users/Settings
tabs scrolled out of view along with everything else, and the team lost
their place. Restructured it to the same pattern `SettingsPage.jsx` already
uses: `h-dvh flex flex-col` with the header/tabs as fixed `shrink-0`
children, and only `<main>` (`min-h-0 flex-1 overflow-y-auto`) scrolling.
Verified visually against an isolated server, logged in as a real (in-memory)
admin account: the header and tabs now stay in view while scrolling down to
reach "Save settings". `npm test` 261/261, `npm run test:e2e` 19/19
(unaffected - no e2e coverage of the admin panel exists yet, see Known
issues), lint clean, build succeeds.

**Earlier verification (2026-09-27, after Phase 16b):** `npm test` 261/261 pass (30
new: 15 Google sign-in with Google's endpoints faked, 15 block / clear / mute /
shared files / theme), `npm run test:e2e` 16/16 pass (4 new in
`settings.spec.js`), lint clean, `npm run build` succeeds. Checked visually
against an isolated in-memory server (never the shared Atlas DB): chat,
Contact info panel, block confirmation and Settings in both light and dark
mode, and the Google error message on the login page. The real Google round
trip could not be tried yet - it needs the team's OAuth credentials.

**Earlier verification (2026-09-27, after Phase 16a):** `npm test` 231/231 pass,
`npm run test:e2e` 12/12 pass (including two new specs: the offline → online
→ opened tick progression, and "typing…"), lint clean, `npm run build`
succeeds (and ships `sw.js`). Also checked in a real browser against an
isolated in-memory server: Remember me produces a 30-day cookie; "Passwords do
not match" blocks a mistyped sign-up; the "Log out?" dialog; the error screen
when `/auth/me` cannot be reached.

**Earlier verification (2026-09-27, after Phase 15):** `npm test` 221/221 pass, lint
clean in both workspaces, `npm run build` succeeds. Also checked by hand in
the browser as a real admin account (`aman`, promoted via `npm run make-admin`):
Overview/Users/Settings tabs all load and work; suspending `priya` showed
"Your account has been suspended" on her very next login attempt; unsuspending
restored it; the announcement banner appeared live on the Chats page and the
sidebar the moment it was saved, with no reload; a registration attempt with a
non-Gmail email was rejected by the live server with the exact configured
domain list in the message, and a Gmail one was accepted. Playwright e2e was
not re-run for this phase either (see Known issues).

**Earlier verification (2026-09-27, after Phase 14):** `npm test` 207/207 pass, lint
clean in both workspaces. Also checked by hand in the browser with two real
accounts (aman, priya): reply preview renders and sends correctly; delete for
everyone shows "This message was deleted" to both sides and the sidebar
preview recomputes live; delete for me removes the message on one account
only, confirmed the other account still sees it; forward to a third friend
(rahul) delivers instantly with a "Forwarded" label; copy writes to the
clipboard. Playwright e2e was not re-run for this phase (see Known issues).

**Earlier verification (2026-09-27, after Phase 13):** `npm test` 194/194 pass,
`npm run test:e2e` 11/11 pass (run three times, no flakes), lint clean in both
workspaces, `npm run build` succeeds, `npm audit --omit=dev` 0
vulnerabilities. Also checked by hand in the browser: the green theme, pill
tabs and top-bar sidebar render correctly.

**Earlier verification (2026-09-27, after Phase 12):** `npm test` 189/189 pass,
`npm run test:e2e` 9/9 pass (run three times, no flakes), lint clean in both
workspaces, `npm run build` succeeds, `npm audit --omit=dev` 0
vulnerabilities.

**Earlier verification (2026-09-27, after Phases 10-11):** `npm test` 175/175 pass,
`npm run test:e2e` 5/5 pass (run twice), lint clean in both workspaces,
`npm run build` succeeds, `npm audit --omit=dev` 0 vulnerabilities. Also
checked by hand against the real Atlas database: bio saved, a picture cropped
to 256×256 and served from GridFS, a photo with caption and a PDF sent and
downloaded with the right headers, sidebar previews.

**Earlier verification (2026-09-26):** `npm test` 88/88 pass (run twice, no flakes),
`npm run test:e2e` 3/3 pass (run twice), `npm run lint` clean in both
workspaces, `npm run build` succeeds, `npm audit --omit=dev` 0
vulnerabilities. Also checked by hand in a browser against the production
build: register, live friend request + accept, two-way real-time chat, HTML
shown as text, Shift+Enter line breaks, "Last seen", mobile layout and back
button.

**Not yet committed.** Per the working agreement, commit only after the team
confirms it works. Suggested: one commit per phase is no longer possible
cleanly, so one commit "Phases 1-9: complete ChatApp (later renamed PingMe)" is fine.

---

## Where things are

### Server (`server/src`)
- `config/` - `env.js` (zod-validated env), `db.js`
- `models/` - `User`, `Friendship`, `Conversation`, `Message`
- `services/` - `authService` (hashing, JWT, cookie options), `friendService`
  (search, requests, lists, `assertParticipant`, `assertFriends`,
  `getFriendIds`), `messageService` (history, `sendMessage`),
  `presenceService` (in-memory connection counts only)
- `controllers/`, `routes/` - thin; zod schemas live in the route files
- `middleware/` - `requireAuth`, `validate` (+ `objectId`), `rateLimits`,
  `errorHandler`, `notFound`
- `socket/` - `index.js` (init, rooms), `socketAuth.js`, `emitter.js`
  (`emitToUser`), `handlers/messageHandlers.js` (`message:send`/`:delete`/`:forward`),
  `handlers/presenceHandlers.js`, `handlers/readHandlers.js`
- `utils/` - `AppError`, `pairKey`, `publicUser` (+ `selfUser`)
- `scripts/seed.js`

### Client (`client/src`)
- `api/` - `http.js` (axios + 401 interceptor + `errorMessage`), `auth`,
  `friends`, `conversations`
- `store/useChatStore.js` - all chat state and the fetch actions
- `context/` - `AuthContext`, `SocketContext`
- `hooks/useSocketEvents.js` - every socket listener
- `pages/` - `LoginPage`, `RegisterPage`, `ChatPage`
- `components/` - `common/` (Avatar, Button, Icons, Logo, Spinner, TextField,
  Toasts), `layout/AuthLayout`, `sidebar/` (Sidebar, ChatsTab, RequestsTab,
  AddFriendTab), `chat/` (ChatWindow, MessageList, MessageBubble,
  MessageInput, EmptyChat)
- `utils/` - `time.js`, `avatar.js`

### Phases 10-11 additions
- Server: `models/Attachment.js`; `services/profileService.js`,
  `attachmentService.js`, `storageService.js` (GridFS - the only file that
  knows where bytes live); `middleware/upload.js` (multer, memory);
  `utils/fileType.js` (magic bytes), `utils/sendStoredFile.js` (streaming +
  Range); `controllers/attachments.controller.js`,
  `routes/attachments.routes.js`; new routes in `users.routes.js` and
  `conversations.routes.js`; hourly cleanup in `server.js`; CSP `blob:` in
  `app.js`.
- Client: `api/profile.js`, `utils/files.js`, `utils/image.js`,
  `components/common/Dialog.jsx`, `components/profile/ProfileDialog.jsx` and
  `UserProfileDialog.jsx`; attachments in `MessageInput`, `MessageBubble`,
  `MessageList` (photo viewer), `ChatWindow` (two-step send, retry).
- Tests: `profile.test.js`, `attachments.test.js`, `fileType.test.js`, new
  cases in `socket.test.js`; `e2e/profile-attachments.spec.js`,
  `e2e/helpers.js`.

### Phase 12 additions
- Server: `services/emailService.js` (the only file that knows how email is
  sent - a single `fetch` call to Brevo's API, no SDK); three new
  `authService` functions (`requestPasswordReset`, `resetPassword`,
  `changePassword`); `User` gained `passwordChangedAt`,
  `resetPasswordTokenHash`, `resetPasswordExpires`; `signToken` now signs a
  custom millisecond `ts` claim (JWT's own `iat` is only whole seconds - too
  coarse to reliably invalidate other sessions the instant a password
  changes, see `docs/EXPLAINED.md` Phase 12); new routes
  `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`,
  `PATCH /api/auth/password`; new env vars `BREVO_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `APP_URL` (all optional with safe
  defaults, so the app still boots without them).
- Client: `pages/ForgotPasswordPage.jsx`, `pages/ResetPasswordPage.jsx`; a
  "Forgot password?" link and a post-reset banner on `LoginPage`; a "Change
  password" section inside `ProfileDialog`.
- Tests: `server/tests/password.test.js` (14 cases, using
  `emailService.sentEmails` to read the reset link without any real
  network call); `e2e/password.spec.js` (4 cases - the email-dependent half
  of forgot/reset is covered at the server level instead, since e2e has no
  real Brevo key configured).

### Phase 13 additions
- Server: `Conversation.lastRead` (a Map, keyed by user id, of
  `{ upTo, at }`); `messageService.markRead` (the "only moves forward" atomic
  update) and `getHistory`'s new `theirReadUpTo` field;
  `socket/handlers/readHandlers.js` (`conversation:read` in,
  `message:read` out - fire-and-forget, no ack required, its own small
  per-socket rate limit).
- Client: `store/useChatStore.js` gained `readUpTo` + `setReadUpTo`;
  `useSocketEvents.js` emits `conversation:read` the moment a message
  arrives in the currently-open chat, and `ChatWindow.jsx` emits it when a
  chat is opened (and again after a reconnect); `MessageBubble.jsx` shows a
  clock, a single grey tick, or two blue ticks accordingly.
- **The whole visual style moved to a WhatsApp look**: `index.css` defines a
  `--color-brand-*` scale (WhatsApp green) and a `.chat-background` doodle
  pattern; every component that used Tailwind's `blue-*` utilities now uses
  `brand-*` at the same shade number; `MessageBubble`, `MessageInput` and
  `Sidebar` were restyled (pale-green vs. white bubbles with the
  timestamp/tick inside them, a pill composer with a circular send button, a
  sidebar top bar in place of the old footer). Requested and approved as a
  spec change to the previously-fixed "blue primary colour" style rule.
- Tests: `server/tests/readReceipts.test.js` (5 cases) and
  `e2e/readReceipts.spec.js` (2 cases, live blue-tick behaviour on both
  triggers - opening a chat, and a message arriving while already open).

### Phase 14 additions
- Server: `Message` gained `replyTo` (a snapshot taken at send time, not a
  live reference - see `docs/EXPLAINED.md`), `deletedForEveryone`,
  `deletedFor` (an array of user ids) and `forwarded`; `Conversation.lastMessage`
  gained `messageId`, so a delete can tell whether it needs to recompute the
  sidebar preview. `messageService.js` gained `deleteMessage` and
  `forwardMessage`, and `sendMessage`/`getHistory`/`messageView` were extended
  for replies and soft deletes. `socket/handlers/messageHandlers.js` gained
  `message:delete` and `message:forward` (sharing one rate limiter, 20 per 5
  seconds), and `message:send` gained an optional `replyToId`.
- Client: `useChatStore.js` gained `applyMessageDeleted` and `setLastMessage`;
  `useSocketEvents.js` gained the `message:deleted` listener; `MessageBubble.jsx`
  gained the hover/tap actions menu (Reply, Copy, Forward, Delete), the quoted
  reply preview, the "Forwarded" label and the "This message was deleted"
  placeholder; `MessageInput.jsx` gained the reply-preview bar; new
  `ForwardDialog.jsx` (friend multi-select).
- Tests: `server/tests/messageActions.test.js` (13 cases - reply snapshot,
  delete for me, delete for everyone with its time limit and sender check,
  sidebar preview recompute, forward including attachment cloning, multi-target
  forward with a per-target failure, and the two 404 permission checks).

### Phase 15 additions
- Server: new `models/Setting.js` (a singleton document - every admin-editable
  knob in one place); `User` gained `isAdmin` and `suspended`;
  `services/settingsService.js` (`getSettings` upserts the singleton on first
  read, `publicSettingsView`/`adminSettingsView`, `updateSettings` which
  broadcasts `settings:updated` to everyone); `services/adminService.js`
  (`listUsers` - a DELIBERATE partial/case-insensitive search, unlike the
  exact-only one everywhere else - `suspendUser`, `unsuspendUser`,
  `deleteUser`, `getStats`); `middleware/requireAdmin.js`;
  `routes/admin.routes.js` + `controllers/admin.controller.js` (everything
  under `/api/admin/*`) and `routes/settings.routes.js` (the one
  unauthenticated `GET /api/settings/public`); `socket/emitter.js` gained
  `emitToAll` and `disconnectUser` (`io.in(room).disconnectSockets()` - forces
  a suspended user's open tabs offline immediately); `authService.register`
  now checks `registrationOpen` and `allowedEmailDomains` before anything
  else, and `login`/`userFromToken` both reject a suspended account;
  `attachmentService.assertCanUpload` and `messageService.forwardMessage`
  check their matching feature toggle; `messageService.deleteMessage` reads
  `deleteForEveryoneWindowMinutes` instead of a hardcoded constant; new script
  `scripts/makeAdmin.js` (`npm run make-admin -- <username>`) bootstraps the
  first admin, since there is no panel yet to grant it from.
- Client: `pages/AdminPage.jsx` (a standalone route, not part of the chat
  layout, gated on `user.isAdmin`) with `components/admin/OverviewTab.jsx`,
  `UsersTab.jsx`, `SettingsTab.jsx`; new `api/admin.js` and `api/settings.js`;
  `components/common/AnnouncementBanner.jsx` (rendered in both `AuthLayout`
  and `ChatPage`, since `SocketProvider` only wraps the logged-in side - only
  the logged-in copy gets LIVE updates, both get the initial fetch);
  `RegisterPage.jsx` now shows "Registration is currently closed" and hints
  the allowed email domains, from the public settings endpoint; a small
  shield icon next to Log out in the sidebar, shown only for `user.isAdmin`.
- Tests: `server/tests/admin.test.js` (14 cases - public settings, 401/403 for
  non-admins, settings read/update/validation, registration blocked when
  closed and by domain, user list/search, self-suspend/self-delete guards,
  suspend blocking login AND an existing REST session, delete removing a
  friendship live while keeping the conversation, stats, and a real
  Socket.IO test proving a suspend force-disconnects an open socket
  immediately). `helpers.js`'s default test email domain changed from
  `@example.com` to `@gmail.com` (and every test file that hardcoded the old
  domain literally) to match the new default Gmail-only rule -
  `server/src/scripts/seed.js` was NOT changed, since it inserts users
  directly and never goes through the registration check at all.

### Phase 16a additions
- Server: `authService` gained `sessionCookieOptions(remember)` /
  `baseCookieOptions` (replacing the single `cookieOptions`) and a `rm` claim in
  `signToken`; `loginSchema` gained `rememberMe`. `Conversation.lastDelivered`;
  `messageService.markDelivered` (one atomic forward-only update) and
  `catchUpDelivered`; `getHistory` returns `theirDeliveredUpTo`.
  `messageHandlers.js` marks delivered after a send/forward when the recipient
  is online; new `socket/handlers/deliveryHandlers.js` (catch-up on connect)
  and `typingHandlers.js` (the `typing` relay).
- Client: `components/common/ErrorScreen.jsx` (`ErrorScreen` +
  `ErrorBoundary`, wrapped around the app in `main.jsx`); `AuthContext` gained
  `bootError` / `retrySession`; Remember me on `LoginPage`; Confirm password
  on `RegisterPage`; "Log out?" dialog and `NotificationPrompt.jsx` in the
  sidebar; `utils/notifications.js` + `public/sw.js`; the store gained
  `deliveredUpTo`, `typing`, `setDeliveredUpTo`, `setTyping`; grey double tick
  in `MessageBubble`; "typing…" in the chat header and Chats row; unread count
  in the tab title (`ChatPage`); read-marking now waits for the tab to be
  visible (`ChatWindow`, `useSocketEvents`).
- Tests: `server/tests/deliveryTyping.test.js` (8 cases), 2 Remember-me cases in
  `auth.test.js`; e2e: `readReceipts.spec.js` rewritten for three states plus a
  typing spec; `chat.spec.js` and `profile-attachments.spec.js` now expect
  "Delivered" (the friend is online) and confirm the logout dialog;
  `e2e/helpers.js` fills Confirm password.

### Phase 16b additions
- Server: `models/Block.js`; `User` gained `authProvider`, `googleId`,
  `theme` (and `passwordHash` is no longer required); `Conversation.mutedBy`;
  `services/googleAuthService.js` + `googleStart` / `googleCallback` in
  `auth.controller.js` (`GET /api/auth/google`, `/api/auth/google/callback`);
  `friendService` gained `isBlockedEitherWay`, `blockUser`, `unblockUser`,
  `listBlocked`, a per-person `muted` flag on friend rows, and hides a preview
  I deleted/cleared; `messageService` gained `listSharedAttachments`,
  `clearConversation`, `setMuted`; routes `GET /api/users/me/blocked`,
  `POST|DELETE /api/users/:id/block`, `GET /api/conversations/:id/attachments`,
  `POST /api/conversations/:id/clear`, `PATCH /api/conversations/:id/mute`;
  `PATCH /api/users/me` accepts `theme`; public settings report `googleSignIn`;
  SelfUser adds `theme`, `authProvider`, `googleLinked`.
- Client: `components/layout/LoggedInLayout.jsx` (one socket + listeners +
  banners + toasts shared by `/` and the new `/settings`, so nothing
  disconnects when Settings opens); `pages/SettingsPage.jsx`;
  `components/chat/ContactInfoPanel.jsx` (replaces the old
  `UserProfileDialog.jsx`, now deleted); `common/ConfirmDialog.jsx`,
  `LogoutDialog.jsx`, `Switch.jsx`, `GoogleButton.jsx`;
  `hooks/useFriendStatus.js`; `utils/theme.js`, `utils/preferences.js`,
  `public/theme-init.js`; dark-mode variables in `index.css`; new
  `bg-surface` / `bg-overlay/*` / `text-meta` tokens replacing hard-coded
  white/black classes everywhere; muted chats show a bell-off icon and a grey
  unread badge; the header's "Remove friend" button moved into Contact info.
- Tests: `server/tests/google.test.js`, `server/tests/chatControls.test.js`;
  `e2e/settings.spec.js`; `profile-attachments.spec.js` now checks the
  Contact info panel instead of the old profile dialog.

### Phase 17 additions (client only - no server changes)
- `index.css`: a small set of `@keyframes` (`message-in`, `fade-in`,
  `slide-down`, `scale-in`, `pop`, `bounce-dot`, `dialog-in`) and matching
  `.animate-*` utility classes, all inside one
  `@media (prefers-reduced-motion: no-preference)` block so reduced-motion
  users get the exact same UI with no animation, instantly. A native
  `dialog[open]` CSS rule animates every dialog (profile, confirm, contact
  info, forward) open with no JS changes needed. `body`/`.chat-background`
  get a quick colour transition so switching light/dark fades instead of
  snapping.
- `components/common/TypingDots.jsx` - three bouncing dots, used next to
  "typing…" in the chat header (`useFriendStatus` now also returns
  `typing`) and the Chats row.
- `MessageList.jsx` / `MessageBubble.jsx`: a message slides in only if it is
  (a) at the current tail of the array and (b) the conversation's initial
  history has already been shown - so opening a chat never animates in 30
  bubbles at once, and older messages loaded by scrolling up never slide in
  either. Captured once via a lazy `useState` at each bubble's own first
  mount (`<Fragment key={m.clientId}>` guarantees one mount per message), so
  later re-renders (a tick changing colour) never replay it.
- Micro-interactions: buttons/switches get a tactile press-scale and
  smoother hover transitions; the sidebar's tab panel gets a cross-fade on
  switch (`key={tab}`); unread/request badges "pop" in; toasts, the
  announcement banner, the reconnecting banner and the notification prompt
  slide/fade in instead of appearing abruptly; the upload progress bar
  animates its width; the Add Friend result card scales in.
- Responsiveness: Contact info now goes side-by-side with the chat at `lg`
  (1024px) instead of `xl` (1280px), with a narrower `lg:w-80` before
  widening to `xl:w-96` - it was previously cramped or absent on common
  laptop widths just under 1280px.

### Phase 17 additions, round two (client only)
- Thin, brand-toned scrollbars everywhere (`scrollbar-width`/`-color` +
  `::-webkit-scrollbar`) instead of the browser default.
- A CSS-drawn speech-bubble "tail" on text-only messages
  (`.bubble-tail-mine` / `.bubble-tail-theirs`), skipped on attachment
  bubbles (their `overflow-hidden`, needed to clip the image/video, would
  cut a protruding tail off).
- `components/common/Skeleton.jsx` - shimmering grey placeholders, replacing
  the bare spinner while the Chats list or a chat's history loads.
- The selected Chats row gets a left accent bar, not just a background tint.
- A soft pulse ring behind an online friend's avatar dot (own
  `.animate-online-pulse` keyframe, not Tailwind's `animate-ping`, so it
  still respects `prefers-reduced-motion` like everything else here).
- Settings cards get a hover shadow-lift; the composer's pill gets a
  focus-within ring; `AuthLayout` gets a soft two-corner brand-tinted
  background (`color-mix()`, so it adapts to dark mode automatically
  through the same CSS variables, no separate dark rule needed).

### Phase 18 additions (voice notes)
- Server: `utils/fileType.js` recognises voice recordings by their bytes -
  WebM with only sound codecs (`A_OPUS`/`A_VORBIS`, no `V_*`), Ogg with
  Opus/Vorbis (Theora refused), MP4 whose only `hdlr` track type is `soun`,
  and the `M4A ` brand - as `kind: 'audio'`; any WebM/MP4 with a picture
  track, or whose tracks can't be found, stays `video` exactly as before.
  `Attachment` gained `kind: 'audio'`, `durationMs` and `waveform` (display
  only, measured by the sender's browser); `attachmentView` includes them for
  audio only; 10 MB limit; served inline; `forwardMessage` copies them.
  The upload route validates two optional multipart fields after multer
  (`validate` now keeps an earlier `req.valid` so a route can call it twice).
- Client: `hooks/useVoiceRecorder.js` (MediaRecorder + AnalyserNode, format
  chosen per browser, 5-minute limit, releases the mic on unmount),
  `chat/VoiceRecorderBar.jsx` (timer, live waveform, swipe-left / trash /
  Escape to cancel), `chat/VoicePlayer.jsx` (waveform seek bar, 1× / 1.5× /
  2×, one playing at a time); `MessageInput` shows a mic instead of Send when
  empty; `ChatWindow.send` passes `voice` through upload and Retry;
  `uploadAttachment` sends the two fields; "🎤 Voice message" in the sidebar
  preview, notifications, reply snippets and the forward dialog; a "Voice
  messages" section in Contact info; `formatDuration` in `utils/time.js`;
  Mic / Play / Pause icons.
- Tests: fileType + attachments + messageActions cases on the server;
  `e2e/voiceNotes.spec.js` (fake microphone: record → send → the other side
  plays it, speed cycling, swipe-to-cancel sends nothing, Contact info lists
  it; a too-short note is not sent).

### Phase 19 additions (public home page)
- `pages/LandingPage.jsx` - the home page at `/` for logged-out visitors
  (sections listed in CLAUDE.md, "Home page"); `components/landing/ChatPreview.jsx`
  - the laptop + phone picture of a chat, built from the app's own pieces.
- `App.jsx` - `/` is `LandingPage` when logged out (the chat when logged
  in); logged-out `/settings` and `/admin` go to `/login`.
- `AuthContext` - `clearSession` (Log out, and any 401) now navigates to
  `/login` itself, because `/` no longer redirects there.
- `AuthLayout` - the logo links back to `/`.
- `common/buttonClass.js` - `Button`'s classes as a function (plus a new `lg`
  size), so links can look like buttons; `Button.jsx` now uses it.
- `Icons.jsx` - Zap, Lock, Image, Smartphone, User, Keyboard, ArrowRight,
  ChevronDown. `index.css` - `landing-pop`, `landing-tick`, `animate-float`,
  `reveal` (scroll-driven) and smooth anchor scrolling, all reduced-motion
  aware. `index.html` - fuller meta description, Open Graph tags, Inter 800.
- Tests: `e2e/landing.spec.js` (content + honest claims, header link jumps,
  FAQ opens, Get started / Log in / logo links, logged-in `/` is still the
  chat, fits 320px, dark mode); `chat.spec.js` and `password.spec.js`
  updated.

### Phase 20 additions (PingMe updates channel)
- Server: `models/Update.js` (`text`, `imageFileId`, `author`), `User.updatesReadUpTo`,
  `services/updateService.js`, `controllers/updates.controller.js`,
  `routes/updates.routes.js` (summary, list, read, image) and two admin
  routes in `admin.routes.js` (post, delete); `singleFile` gained
  `{ optional: true }` so a post can be text only.
- Client: `api/updates.js`, `postUpdate` / `deleteUpdate` in `api/admin.js`;
  an `updates` section and `UPDATES_CHAT_ID` in the store;
  `components/updates/` (`UpdatesRow`, `UpdatesChannel`, `PingMeAvatar`);
  `ChatsTab` pins the row first; `ChatPage` opens the channel; three new
  listeners in `useSocketEvents` (and the reconnect refetch skips the
  sentinel id); `LoggedInLayout` loads the summary and counts it in the tab
  title; `components/admin/UpdatesTab.jsx` + an "Updates" tab in
  `AdminPage`; `VerifiedIcon`.
- Tests: `server/tests/updates.test.js`, `e2e/updates.spec.js`;
  `e2e/start-server.js` promotes accounts named `admin_e2e...` to admin (test
  server only - production has no such path).

### Tests and deployment
- `server/tests/` - `health`, `auth`, `rateLimits`, `friends`,
  `conversations`, `socket` + `setup.js`, `helpers.js`
- `e2e/` - `chat.spec.js`, `start-server.js` (production server on an
  in-memory MongoDB); config in `playwright.config.js` at the root
- `render.yaml`, `.node-version` - Render Blueprint
- `docs/DEPLOY.md`, `docs/diagrams.md`

---

## Decisions made while building (not spelled out in `CLAUDE.md`)

1. **`dotenv`** reads `server/.env` (not in the spec's stack list; needed to
   load the file before zod validates it). Node's `--env-file` would drop it.
2. **Tailwind CSS 4** - no `tailwind.config.js`; theme is set with `@theme` in
   `src/index.css` (Inter font).
3. **Rate limits are skipped under `NODE_ENV=test`** unless
   `ENABLE_RATE_LIMITS=true` (set only by `tests/rateLimits.test.js`).
   Otherwise the suite, all from one IP, locks itself out.
4. **Request `createdAt` = the Friendship's `updatedAt`.** A declined request
   that is sent again reuses the same document, and its last update is when it
   became pending.
5. **`lastMessage` is sent to clients as `{ text, senderId, createdAt, attachment }`**
   (the database field is `sender`), matching the message payload's `senderId`.
6. **Unread counts are client-only** and reset on reload - the spec has no
   server "read" state. No read receipts were added.
7. **History needs `assertParticipant` only**, not `assertFriends`, so an
   unfriended chat stays readable (read-only). Sending checks both.
8. **After an unfriend the chat closes** on the client, because the Chats list
   is the friends list. The history is kept on the server and returns if they
   become friends again.
9. **Unfriend** is an icon button in the chat header with a browser
   `confirm()`; the spec defines the endpoint but not where the UI goes.
10. **The `pending_outgoing` / `pending_incoming` search card** needs a
    request id the search response does not include; it is looked up in the
    requests list in the store (refetched once if missing).
11. **Client ESLint** exempts capitalised unused names (`^[A-Z_]`) - core
    ESLint does not see `<App />` as a use of `App`, as in Vite's template -
    and allows `useAuth` / `useSocket` to be exported beside their providers.
12. **Seed** never deletes; it stops if the demo users already exist.
13. **UI.png** was used for the look only (blue `#2563EB`, Inter, light
    surfaces, bubbles). Its extra screens - Google login, calls, settings
    page, dark mode, landing page - are not in the spec and were not built.
    (Profiles and attachments were added later in Phases 10-11, forgot/change
    password in Phase 12 - all three requested by the team after Phase 9.)
14. **Phases 10-11 were requested by the team after Phase 9** and change
    three original rules (username immutable, no image uploads, text-only
    messages). `CLAUDE.md` was updated to match; decisions taken with the
    team: GridFS storage, username change once per 30 days, picture and bio
    visible to anyone who searches the exact username.
15. **Display name editing** is part of the profile dialog (it is part of the
    profile, though not named in the request).
16. **Profile pictures are cropped to 256×256 WebP in the browser**, so the
    server needs no image library. An animated GIF becomes a still picture.
17. **Unsent uploads are deleted after 1 hour.** Sent messages could not be
    deleted until Phase 14 added it explicitly (see below).
18. **`tests/setup.js` now wipes every collection**, including GridFS's
    `uploads.files` / `uploads.chunks`, which have no mongoose model.
19. **Password reset was requested as its own feature after Phase 9**, adding
    one dependency-free integration (Brevo, via `fetch`) and one new email
    service account for the team to hold. Decisions taken with the team:
    Brevo over Gmail SMTP (keeps a personal inbox out of it); a wrong current
    password is **400**, not 401, specifically so the client's "401 means
    your session expired, log out" rule (Phase 6) never fires for it;
    changing or resetting a password signs out every OTHER device, using a
    custom millisecond `ts` claim rather than JWT's own `iat` (see
    `docs/EXPLAINED.md` Phase 12 for the two real timing bugs this caught,
    and a third bug in the e2e tests themselves - ambiguous label matching).
20. **Read receipts show only 2 states (sent, read), not WhatsApp's 3**
    (sent, delivered, read) - by design. A "delivered" state would be
    meaningless here: full history is always one REST call away, so there is
    no real distinction between "their client has this" and "it exists" the
    way there is for a mobile app relying on push delivery. Faking that
    middle state would be theatre, not information. Decided with the team
    alongside the "full look-alike, light-only" WhatsApp reskin request.
    **Superseded in Phase 16a** - the team asked for the grey double tick, so
    "delivered" now means "reached their app because they were online" (see
    decision 35).
21. **Read receipts are tracked per conversation** (one pointer per
    participant), not per message - far cheaper than a per-message "read by"
    flag, and how WhatsApp itself models a 1:1 chat's read state.
22. **The colour retheme is one token, not scattered hex values**: every
    `blue-*` Tailwind class became `brand-*` at the identical shade number,
    and the scale is defined once in `index.css`. Changing the look again
    later only touches that one file.
23. **Root cause of a login "Network error" in development:** `node --watch`
    watched `node_modules` too, and something (likely OneDrive) touching files
    there restarted the server mid-request. `npm run dev` now uses
    `--watch-path=src`.
24. **Message actions (Phase 14) were requested by the team after Phase 13**,
    with two amendments they asked for directly: a time limit on "delete for
    everyone" (1 hour, matching the intent of WhatsApp's own limit - not in
    the original spec, so it was confirmed with the team rather than assumed)
    and support for forwarding to several friends at once, not just one.
25. **"Delete for everyone" is a soft delete**, never an actual row removal:
    the text and attachment reference stay in the database, but every read
    path (`messageView`, history, live events) hides them behind a fixed
    placeholder once `deletedForEveryone` is true. This keeps the change
    small and reversible at the database level, and matches the "delete for
    me" design (`deletedFor`, an array of user ids) using the same underlying
    document rather than a second collection.
26. **A reply stores a snapshot, not a live reference.** `replyTo` is built
    once, when the reply is sent, from the original message's text/attachment
    at that moment - so if the original is later deleted, the quoted preview
    still shows what it said, exactly like WhatsApp's own quoted replies.
27. **Forwarding clones the attachment's metadata, never re-uploads the
    bytes.** A new `Attachment` document is created pointing at the same
    GridFS `fileId`, `message` already set (so the 1-hour unsent-upload
    cleanup can never touch it, unlike a normal upload's brief unclaimed
    window).
28. **A known, deliberate gap: "delete for me" never touches the shared
    sidebar preview** (`Conversation.lastMessage`). Since `lastMessage` is one
    denormalized field shared by both participants, correctly showing a
    different preview to each of them would need a second, per-user preview
    field - out of proportion to what a "delete for me" is for (hiding a
    message on my own devices, not rewriting shared conversation metadata).
    "Delete for everyone" DOES recompute the shared preview, since in that
    case the underlying message is actually gone for both people.
29. **The admin panel (Phase 15) was requested by the team as an open-ended
    "control everything from one place" ask**, which is not literally
    buildable (nobody can build a UI for features that do not exist yet).
    What was actually built: a real, extensible settings system - one
    `Setting` singleton document, read fresh by whatever needs it, editable
    from a panel - so that ADDING a new toggle later is a small, contained
    change (one schema field, one zod rule, one place that reads it), not a
    new architecture. Confirmed with the team: everything they explicitly
    listed (feature toggles, user management, live stats, an announcement
    banner) is in this first version.
30. **The Gmail-only sign-up rule became a setting, not a hardcoded check**,
    specifically because the team's SECOND request (the admin panel) was
    about not needing a code change for exactly this kind of rule. Chosen
    over maintaining a list of disposable-email domains: temp-mail providers
    change constantly and such a list goes stale immediately, whereas
    restricting to a small allowlist of real providers (starting with just
    `gmail.com`) is simple, robust, and never needs updating.
31. **"Delete user" is a hard, irreversible delete - not a second kind of
    suspend.** It deletes the account and every Friendship row involving it
    (so the person vanishes live from every remaining friend's list, reusing
    the existing `friend:removed` / `friend:request:cancelled` events rather
    than inventing new ones), but deliberately leaves their past Messages and
    Conversations alone - the same "keep the other person's history" principle
    `friendService.unfriend` already uses. Considered and rejected: a fuller
    cascade that also scrubs or reattributes old messages - out of proportion
    to what was asked, and this app's own history-keeping philosophy already
    argues against it.
32. **Suspending a user force-disconnects their OPEN sockets** (`io.in(room)
    .disconnectSockets()`), on top of `userFromToken` rejecting their next
    REST call or handshake. Without the force-disconnect, a suspended user
    with an already-open tab could keep sending messages until they happened
    to reconnect or their token expired naturally (up to 7 days) - suspension
    needs to mean "now", not "eventually".
33. **An admin can never suspend or delete their own account** (400) - simple
    self-lockout protection, since there is no in-app way to un-suspend
    yourself once your own session stops working.
34. **The admin panel's own user search is deliberately partial and
    case-insensitive** (username OR email), unlike the exact-only search
    every ordinary user gets. This is not a contradiction of the "no
    browsing the directory" rule - that rule protects against an ORDINARY
    user listing everyone; an admin's own tool doing the opposite is the
    entire point of it, and it is gated by `isAdmin` regardless.
35. **"Delivered" is decided by the server, not reported by the client.** The
    moment the recipient is online, the `message:new` just emitted to their
    room has reached their app; on connect, everything already waiting has.
    Both are forward-only pointer moves. This needs no extra client event at
    all, and cannot be faked by a client claiming delivery it never had.
36. **A chat open in a hidden/minimised tab is not "read".** Before Phase 16a
    the client marked messages read the moment they arrived in the open chat,
    visible or not; with a separate "delivered" state (and notifications),
    that would have turned ticks blue for messages nobody had seen. Reading
    now waits for `document.hidden` to be false.
37. **Remember me unticked means a true browser-session cookie** (no
    `maxAge`), not merely a shorter one - the conventional meaning, and the
    safe default on a shared or lab computer. Registration behaves as ticked.
38. **Notifications work while PingMe is open (any tab, even minimised), not
    when the browser is closed.** The closed-browser case would need Web Push
    (VAPID keys, stored push subscriptions, a push library) - a meaningful
    extra system; left out unless the team asks. A service worker is used
    anyway, only because Android Chrome refuses page-created notifications.
39. **The composer is now keyed per conversation**, so switching chats clears
    an unsent draft. Before, the text typed for one friend stayed in the box
    when opening another - more likely to cause a message sent to the wrong
    person than to save anyone's draft.
40. **Google sign-in is written by hand with `fetch`**, the same way as the
    Brevo email (no Passport, no Google SDK): about 100 lines in
    `googleAuthService.js`, which the team can read and explain line by line.
    A random `state` in a short-lived cookie stops login CSRF.
41. **A Google account with the same email as a password account is linked,
    not duplicated** - Google has verified the email, so it is the same
    person. New Google accounts get a username from the email (with random
    digits if taken), changeable later. Registration being closed still
    applies to NEW Google accounts; the allowed-email-domains rule does not
    (it exists to stop throwaway emails, and a verified Google account is not
    one). A Google-only account has no password, so password login gives the
    usual 401 and "Forgot password" is how to set one.
42. **Blocking works in both directions and is silent.** Either side blocking
    makes search and friend requests act as if the other did not exist (404
    "No user found"), so being blocked cannot be detected. It ends the
    friendship but keeps the history, exactly like an unfriend.
43. **Clear chat is "delete for me" on every message at once** (one
    `updateMany` adding me to `deletedFor`), and mute is a per-person list on
    the conversation - both reuse existing mechanisms instead of new
    collections, and neither changes anything for the other person.
44. **Dark mode flips CSS variables instead of adding `dark:` classes.**
    Tailwind v4 writes every colour utility as `var(--color-...)`, so
    redefining the grey scale and a few status colours under
    `[data-theme='dark']` re-colours every component with no per-element
    changes. Only true white/black needed new tokens (`surface`, `overlay`,
    `meta`). The theme is saved on the account (follows you to any device)
    and cached in localStorage so `theme-init.js` can apply it before the
    first paint.
45. **Enter-to-send and notifications are per-device settings** (this
    browser only), because they depend on the keyboard/device, while theme is
    per-account.

---

## Known issues and open points

1. **`npm audit` shows 2 moderate issues in Vitest** (dev-only test runner,
   never deployed). The spec's bar - no high or critical - is met, and
   production dependencies have 0. The fix is Vitest 5, a breaking upgrade;
   do it separately and re-run the suite.
2. **npm 11 blocks install scripts** for `esbuild` and `mongodb-memory-server`
   ("allow-scripts" warnings on `npm install`). Nothing breaks: esbuild ships
   prebuilt binaries, and mongodb-memory-server downloads MongoDB on first
   use instead. To silence the warning: `npm approve-scripts esbuild`.
3. **First `npm test` downloads MongoDB (~600 MB)** into
   `node_modules/.cache`. Run tests from the repo root so that cache is
   reused.
4. **Single instance only** - presence is in memory (see README, Scaling note).
5. **Render free tier sleeps** after ~15 minutes idle; first request takes up
   to a minute.
6. **Development database.** `server/.env` points at the team's Atlas cluster
   (set up 2026-09-26), so `npm run dev` and `npm run seed` work without a
   local MongoDB. Tests and e2e use an in-memory MongoDB. Rotate the Atlas
   user's password before deploying - it was shared in a chat once.
   **This is also the database the live Render site uses** - `npm run dev`,
   `npm run seed` and any manual testing all write to real, live data. A
   separate development cluster (or a local MongoDB) would be safer.
7. **Storage size.** The free Atlas cluster holds 512 MB in total, shared by
   all data and files. Fine for a demo or viva; heavy video use needs a paid
   tier or object storage (only `storageService.js` would change).
8. **Uploads are held in memory** while being checked (max 25 MB each, 20 per
   hour per user). Fine for one small instance.
9. **An old username becomes available** to others once changed (by design;
   the user is warned).
10. **`APP_URL` must be set correctly on Render** (or forgot-password emails
    link to `localhost`). It defaults to `http://localhost:5173`, which is
    right for local development but wrong in production - see `docs/DEPLOY.md`.
11. **Brevo free tier is 300 emails/day**, and `EMAIL_FROM_ADDRESS` must be a
    sender verified in Brevo's dashboard, or sending silently does nothing
    (logged server-side, never breaks the request - see Phase 12).
12. **Sessions from before Phase 12 shipped** have no `ts` claim, so the
    "log out every other device" check is skipped for them specifically
    (never for sessions created after that point). They age out within 7 days.
13. **No e2e specs yet for message actions (Phase 14) or the admin panel
    (Phase 15)** - both are covered by server tests and were checked by hand.
    The whole e2e suite (16 specs) was re-run and passes after Phase 16b.
15. **Notifications cannot be seen in automated tests** - headless Chromium
    reports the permission as already decided, so the "Enable" offer stays
    hidden and no notification is shown. They need a manual check (see
    `docs/TEST_CASES.md`, M16a).
14. **The admin panel's client-side "can I still delete for everyone" hint**
    (in `MessageBubble.jsx`) does not read the admin-configured
    `deleteForEveryoneWindowMinutes` - it is hardcoded to 60 minutes. If an
    admin changes that setting, the button may hide itself too early or too
    late compared to what the server would actually allow; the server always
    enforces the real, current value regardless, so this can only ever hide
    the button too early, never let through a delete the server would refuse.
16. **Google sign-in needs setting up once** in Google Cloud Console (see
    `docs/DEPLOY.md`): an OAuth client of type "Web application" with the
    redirect URIs `http://localhost:5173/api/auth/google/callback` and
    `https://chatapp-xu38.onrender.com/api/auth/google/callback`, then
    `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `server/.env` and on
    Render. Until then the button is simply not shown. While the consent
    screen is in "Testing" mode, only the Google accounts added as test users
    can sign in.
17. **Dark mode's red text is the same red as light mode** (`red-600`) - it
    passes contrast on the dark background but is not as soft as WhatsApp's
    own; changing it would also change the danger button, so it was left.
18. **Voice notes are only automatically tested in Chromium.** Firefox (Ogg)
    and Safari (MP4) recordings are covered by server tests built from their
    documented header layout, but have not been recorded in those real
    browsers yet - worth one manual try each (M18.6). The microphone also
    needs HTTPS (or localhost), which Render provides.
19. **A voice note's length and waveform are the sender's own measurements**
    (display only). A dishonest client could only draw a wrong picture of
    its own recording; the file itself is still type-checked by its bytes.
    Scrubbing through a long Chrome WebM note can be slightly less precise,
    because MediaRecorder's WebM has no seek index.
20. **A returning user whose session has ended sees the home page, not the
    login form, when they next open the site** - to the app they are simply a
    logged-out visitor (it cannot know they had an account). One click on
    "Log in" gets them there. A session that ends WHILE the app is open
    (log out, a 401) still goes straight to `/login`.
21. **The scroll fade-in (`reveal`) needs CSS `animation-timeline`** (checked
    in Chromium). A browser that does not support it yet skips the rule
    (`@supports`) and simply shows the cards with no fade - nothing is hidden
    or broken either way.
22. **Vite now warns that the one JavaScript file is over 500 kB** (511 kB,
    156 kB gzipped; it was 484 kB before the home page). Only a warning - the
    build succeeds. Splitting the logged-in app from the home page with
    `React.lazy` would fix it if it ever matters.
23. **The Admin "Updates" tab is not live** - like the rest of the admin
    panel it has no socket (by design), so it refreshes its own list after
    each post or delete; another admin's post shows after reopening the tab.
24. **Updates are text and one photo only** - no links that open, no video,
    no reactions or replies (it is read-only, like WhatsApp's own chat).
    A URL in a post is shown as plain text.

---

## Post-16b bugfix (2026-09-27): switching chats could show the wrong one

**Reported by the team:** clicking a different chat sometimes showed the
*previous* chat's messages under the new chat's header, and scrolling
produced blank space - the whole page was scrolling, not just the message
list.

**Root cause, two compounding bugs**, both introduced while building the
Contact info panel (16b), which needed `ChatWindow`'s content to sit
side-by-side with the panel on wide screens:
1. The column wrapping the header/message-list/composer lost its `min-h-0`.
   Without it, that column grows to fit ALL its content instead of being
   clipped to the available height, so the BROWSER scrolls the whole page
   instead of the message list scrolling internally - which is what made
   switching chats look like it kept the old scroll position.
2. `MessageList` was keyed by `conversationId` on its own, but an old
   instance was not always being cleanly torn down when only ITS key
   changed - proven by adding a temporary mount/unmount log: mounts kept
   happening (with fresh `useId()`s, confirming genuinely separate React
   instances) but zero matching unmounts ever fired, so an old instance
   with the previous chat's messages could remain visible.

**Fix:** added `min-h-0` back to that column, and moved the `key` up to the
whole pane (header + list + composer together) instead of leaving it only
on `MessageList`, so the entire pane is guaranteed to be torn down and
rebuilt together on every switch, regardless of the reconciliation detail
above.

**Also fixed while verifying:** `server/tests/setup.js` and
`e2e/start-server.js` now explicitly clear `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` before running, so the test suites no longer depend
on whatever happens to be in the developer's own `server/.env` - this
surfaced only because Google sign-in was just configured for the first time
locally, immediately breaking two `googleSignIn: false` assertions.

**Verification:** a Playwright regression test
(`e2e/chat.spec.js`, "switching between two chats...") sends messages in two
different chats and asserts switching between them always shows the right
one and never the other, plus that `document.body.scrollHeight` never
exceeds the viewport. Confirmed it fails on the pre-fix code (finds two
`role="log"` regions) and passes after the fix, run cleanly three times.

**Second report, same day - the page itself could still scroll.** After
deploying the fix above, the team reported the content-bleeding was gone,
but scrolling a chat could still reveal blank space, with the chat header
AND the sidebar's own top bar both scrolling out of view together - proof
the whole PAGE was scrolling, not just the message list. Root cause: `html`
and `body` had no `overflow: hidden`, so once an inner scrollable panel
(the message list) reached its own top or bottom, the browser's default
"scroll chaining" handed any further wheel/trackpad input to the page
itself, which then scrolled the fixed-height (`h-dvh`) layout out of view.
Fixed with `html, body { height: 100%; overflow: hidden; overscroll-behavior:
none; }` in `index.css`, plus `overscroll-contain` on every internally
scrollable panel (the message list, the sidebar's chat list, Contact info,
Settings, the forward dialog's friend list) as a second line of defence.
A Playwright test (`e2e/chat.spec.js`, "scrolling the message list never
scrolls the page...") sends real mouse-wheel input hard past both ends of a
long chat and asserts `window.scrollY` stays exactly 0 throughout - confirmed
it fails on the pre-fix code (`windowScrollY: 932`) and passes after.

Full suite after both fixes: `npm test` 261/261, `npm run test:e2e` 18/18
(16 + these 2 new ones), lint clean, build succeeds.

---

## Post-18 bugfix (2026-09-28): the admin panel's back arrow sometimes crashed the page

**Reported by the team:** pressing the back arrow on the Admin panel
sometimes showed the full-page "Something went wrong" screen; a reload
fixed it.

**Root cause:** `/admin` sits outside `LoggedInLayout`, so going back to `/`
mounts that layout - and its `SocketProvider` - afresh, and the socket is
`null` for the first render (it is created in the provider's effect). The
zustand store, however, still had the chat that was open before, with its
messages already loaded, so `ChatWindow`'s "mark as read" effect ran at
once and called `socket.emit` on `null`. It only happened when a chat was
open before going to Admin (on a normal first load the messages are not
loaded yet, so the effect returns early), and a reload fixed it because a
reload empties the store.

**Fix:** that effect now returns early while `socket` is null and lists
`socket` in its dependencies, so it runs again (and marks the chat read) as
soon as the socket exists; `onTyping` uses `socket?.emit` for the same reason.

**Verification:** `e2e/adminNavigation.spec.js` opens a chat with a message,
tells the browser it is an admin (rewrites the `/api/auth/me` response -
the server still refuses the admin API), then goes Admin → back three
times. Confirmed it fails on the pre-fix code (the page shows "Something
went wrong") and passes after. `npm test` 283/283, `npm run test:e2e` 22/22,
lint clean.

## Post-18 bugfix (2026-09-28): the layout on phones

**Reported by the team:** "a responsiveness problem on mobile". Checked every
screen at 320, 360, 390 and 412px wide (and landscape) with touch emulation,
screenshotting each one. Four problems, all in the logged-in part:

1. **The chat was wider than the phone, with its left part cut off** (the
   header read "…iam Iyer", bubbles and the message box were chopped). The
   `<section>` in `ChatWindow` had no `min-w-0`, and a flex item is never
   narrower than its content by default - so a long friend name, and above
   all a long link with no spaces, stretched the whole chat (to 770px on a
   390px phone). `LoggedInLayout`'s `overflow-hidden` then silently cut the
   extra off. Fixed with `min-w-0` there, and **`wrap-anywhere` instead of
   `break-words`** on message text (and the bio, forward preview and Add
   Friend card): `break-words` only breaks a word after its box has already
   grown to the word's full width; `wrap-anywhere` lets the box stay narrow.
2. **Settings had the same missing `min-w-0`** on its `<main>` (the "Edit
   profile" button and text were cut off at 320px).
3. **The message actions menu was drawn behind the bubbles below it**, so
   Reply/Copy/Forward/Delete could not be tapped (on desktop too). Phase 17's
   slide-in animation (`animation: ... both`) leaves a transform on each new
   row, which makes every row its own stacking layer and traps the menu's
   `z-index` inside its row. Fixed by lifting the row (`relative z-20`) while
   its menu is open. Also, the ⋮ button was invisible on touch screens (it
   only appeared on hover); it is now always shown there
   (`[@media(hover:none)]:opacity-100`), as its comment always intended.
4. **Document cards and voice waveforms were cut off at 320px**: the card's
   `min-w-56` and the waveform's 48 bars at 2px + 2px gaps needed more room
   than the bubble had. The bubble now has `min-w-0`, the card is
   `min-w-[min(14rem,100%)]`, and the bars/gaps are 1px below `sm`.

**Verification:** `e2e/mobileLayout.spec.js` (320×640, touch) checks that
nothing in the chat or Settings is wider than the screen or hidden sideways,
that the ⋮ button is visible, and that the element under the menu's "Reply"
really is Reply. Confirmed it fails on the pre-fix code and passes after.
`npm test` 283/283, `npm run test:e2e` 23/23, lint clean.

---

## How to verify everything

1. `npm install`
2. `npm test` - 261 pass
3. `npm run lint` - no errors
4. `npx playwright install chromium` (once), then `npm run test:e2e` - 16 pass
5. `cp server/.env.example server/.env`, fill in `MONGO_URI` and `JWT_SECRET`
6. `npm run seed`, then `npm run dev`, open <http://localhost:5173>
7. `npm run make-admin -- aman` to try the admin panel, then log in as `aman`
8. Work through the manual tables in `docs/TEST_CASES.md`
9. Deploy with `docs/DEPLOY.md` and run its checklist on the live URL
