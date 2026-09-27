# Progress

A new session should be able to read this file and carry on from it.

Last updated: 2026-09-27

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
| 9 | Polish: Playwright end-to-end tests, seed script, deployment, diagrams, final docs | **Done** - live deployment still to be performed by the team (needs your own Atlas + Render accounts, see `docs/DEPLOY.md`) |
| 10 | Profiles: picture (GridFS), bio, display name, username change (once per 30 days), live `user:updated` | **Done** |
| 11 | Attachments: photos, videos, documents - upload, magic-byte type check, permission-checked download with Range, cleanup, chat UI | **Done** |

**Verification (2026-09-27, after Phases 10-11):** `npm test` 175/175 pass,
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
cleanly, so one commit "Phases 1-9: complete ChatApp" is fine.

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
  (`emitToUser`), `handlers/messageHandlers.js`, `handlers/presenceHandlers.js`
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
    surfaces, bubbles). Its extra screens - Google login, forgot password,
    calls, settings page, dark mode, landing page - are not in the spec and
    were not built. (Profiles and media were added later, in Phases 10-11.)
14. **Phases 10-11 were requested by the team after Phase 9** and change
    three original rules (username immutable, no image uploads, text-only
    messages). `CLAUDE.md` was updated to match; decisions taken with the
    team: GridFS storage, username change once per 30 days, picture and bio
    visible to anyone who searches the exact username.
15. **Display name editing** is part of the profile dialog (it is part of the
    profile, though not named in the request).
16. **Profile pictures are cropped to 256×256 WebP in the browser**, so the
    server needs no image library. An animated GIF becomes a still picture.
17. **Unsent uploads are deleted after 1 hour.** Messages (and so sent files)
    are never deleted - the spec has no message deletion.
18. **`tests/setup.js` now wipes every collection**, including GridFS's
    `uploads.files` / `uploads.chunks`, which have no mongoose model.
19. **Root cause of a login "Network error" in development:** `node --watch`
    watched `node_modules` too, and something (likely OneDrive) touching files
    there restarted the server mid-request. `npm run dev` now uses
    `--watch-path=src`.

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
7. **Storage size.** The free Atlas cluster holds 512 MB in total, shared by
   all data and files. Fine for a demo or viva; heavy video use needs a paid
   tier or object storage (only `storageService.js` would change).
8. **Uploads are held in memory** while being checked (max 25 MB each, 20 per
   hour per user). Fine for one small instance.
9. **An old username becomes available** to others once changed (by design;
   the user is warned).

---

## How to verify everything

1. `npm install`
2. `npm test` - 175 pass
3. `npm run lint` - no errors
4. `npx playwright install chromium` (once), then `npm run test:e2e` - 5 pass
5. `cp server/.env.example server/.env`, fill in `MONGO_URI` and `JWT_SECRET`
6. `npm run seed`, then `npm run dev`, open <http://localhost:5173>
7. Work through the manual tables in `docs/TEST_CASES.md`
8. Deploy with `docs/DEPLOY.md` and run its checklist on the live URL
