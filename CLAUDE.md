# CLAUDE.md — PingMe (Real-time chat, MERN + Socket.IO)

## What this project is

A web-based, one-to-one, real-time text chat app. It is a B.Tech CSE final-year project built by a team of 4 at COER University.

The key feature: **users cannot see everyone who has an account.** A user finds another person by searching their **exact username**, sends a **friend request**, and the two can chat only after the request is **accepted**.

Two things matter as much as working code:

1. **The team must be able to explain every file in a viva.** Prefer simple, readable code over clever code. Add short comments that explain *why* wherever it isn't obvious. Avoid unnecessary abstractions and extra libraries.
2. **It must be real-world ready**: secure, tested and deployable.

Do not add features that are not listed here. If something seems missing, or a rule seems wrong, ask before changing it.

---

## Tech stack (fixed — do not change without asking)

- **Server:** Node.js (current LTS), Express 5, Mongoose, Socket.IO 4, zod, bcryptjs, jsonwebtoken, cookie-parser, cookie, helmet, express-rate-limit, morgan, multer (file uploads).
- **File storage:** MongoDB GridFS (built into the MongoDB driver - no extra service or account).
- **Client:** React + Vite (JavaScript, not TypeScript), React Router, Tailwind CSS, axios, socket.io-client, zustand.
- **Tests:** Vitest + Supertest + mongodb-memory-server on the server; Playwright for end-to-end tests.
- **Modules:** JavaScript with ES modules (`"type": "module"`) everywhere.
- **Repo layout:** a monorepo using npm workspaces: `client` and `server`.

Notes:
- **bcryptjs, not bcrypt:** bcryptjs is pure JavaScript, which avoids native build problems on Windows laptops.
- **Express 5 differences:**
  - Rejected promises in async handlers reach the error handler automatically.
  - Wildcard route syntax differs from Express 4, so don't use `app.get('*')`.

---

## Folder structure

```
pingme/
  CLAUDE.md
  README.md
  package.json              # npm workspaces + root scripts
  docs/
    PROGRESS.md             # phase checklist, what's done, known issues
    EXPLAINED.md            # simple explanations of every phase (for viva)
    TEST_CASES.md           # automated + manual test cases
    DEPLOY.md               # deployment guide
    diagrams.md             # Mermaid diagrams for the report
  server/
    package.json
    .env.example
    src/
      config/        env.js (zod-validated env), db.js
      models/        User.js, Friendship.js, Conversation.js, Message.js, Attachment.js
      services/      authService.js, friendService.js, messageService.js, presenceService.js,
                     profileService.js, attachmentService.js, storageService.js
      controllers/   auth, users, friends, conversations, attachments
      routes/        auth.routes.js, users.routes.js, friends.routes.js, conversations.routes.js,
                     attachments.routes.js
      middleware/    requireAuth.js, validate.js, rateLimits.js, upload.js, errorHandler.js, notFound.js
      socket/        index.js, socketAuth.js, emitter.js, handlers/
      utils/         AppError.js, pairKey.js, publicUser.js, fileType.js, sendStoredFile.js
      scripts/       seed.js
      app.js         # builds and exports the Express app (does NOT listen) — used by tests
      server.js      # http server + Socket.IO + DB connect + listen + graceful shutdown
    tests/
  client/
    package.json
    vite.config.js
    src/
      api/           http.js (axios instance), auth.js, friends.js, conversations.js, profile.js
      store/         useChatStore.js (zustand)
      context/       AuthContext.jsx, SocketContext.jsx
      hooks/         useSocketEvents.js
      pages/         LoginPage.jsx, RegisterPage.jsx, ChatPage.jsx
      components/    layout/, sidebar/, chat/, profile/, common/
      utils/         time.js, avatar.js, files.js, image.js
```

---

## Commands (run from the repo root)

| Command | What it does |
|---|---|
| `npm install` | Installs both workspaces |
| `npm run dev` | Runs the server (port 5000, auto-restart) and the client (Vite, port 5173) together via concurrently |
| `npm test` | Runs server tests |
| `npm run test:e2e` | Runs Playwright end-to-end tests |
| `npm run lint` | Runs ESLint on both workspaces |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Production: the server serves the API, sockets and `client/dist` |
| `npm run seed` | Creates demo users and messages (development only; refuses to run in production) |

All scripts must work on Windows, macOS and Linux (use cross-env where environment variables are set in scripts).

---

## Environment variables

These live in `server/.env`. It is never committed. Keep `server/.env.example` up to date.

```
PORT=5000
NODE_ENV=development
MONGO_URI=
JWT_SECRET=          # at least 32 random characters
SENTRY_DSN=          # optional
```

Validate them at startup with zod in `config/env.js`. If one is missing or invalid, exit with a clear message.

**Never print or log the contents of `.env`.**

---

## Architecture rules

- **REST (axios)** is for data that is *fetched*: auth, search, friends, requests and message history.
- **Socket.IO** is for things that *happen*: a new message, presence changes and friend-request events.
- **MongoDB is the single source of truth.** Sockets only notify. The client can always recover correct state by refetching.
- **Development:** Vite proxies `/api` and `/socket.io` (`ws: true`) to `localhost:5000`. The browser sees one origin, so no CORS configuration is needed.
- **Production:** one Node service.
  - Express serves `client/dist` and returns `index.html` for any GET request not under `/api`.
  - Set `app.set('trust proxy', 1)`.
  - Frontend and backend always stay on the same domain, so cookies are first-party.
- **Services hold the business logic** (`friendService`, `messageService`, `presenceService`).
  - Controllers stay thin.
  - Socket handlers call the same services that REST uses.
  - Services never touch `req` or `res`.
- **Services notify users through `emitToUser(userId, event, payload)`** from `socket/emitter.js`. It does nothing when Socket.IO isn't initialised, so REST tests don't need sockets.
- **Errors:** throw `AppError(status, message)`. The central error handler returns `{ message }`. It never leaks stack traces when `NODE_ENV=production`.

---

## Data model

### User

| Field | Rules |
|---|---|
| `username` | String, required, unique, lowercase, trimmed, must match `/^[a-z0-9_.]{3,20}$/`. This is the public ID people search for. It can be changed at most once every 30 days (see Profile rules). |
| `usernameChangedAt` | Date or null. When the username was last changed (registration does not count). |
| `displayName` | String, 1–40 characters |
| `bio` | String, trimmed, 0–160 characters, default `''` |
| `avatarFileId` | ObjectId of the profile picture in GridFS, or null |
| `email` | String, required, unique, lowercase, trimmed |
| `passwordHash` | String, `select: false` |
| `lastSeen` | Date |
| timestamps | |

- **PublicUser shape:** `{ id, username, displayName, bio, avatarUrl }`. These are the ONLY fields ever sent about another user. `avatarUrl` is `/api/users/:id/avatar?v=<avatarFileId>` or null.
- **Friends-only fields:** `online` and `lastSeen` are sent only to friends.
- **Email:** only ever sent to the user themself (via `/api/auth/me`), in the **SelfUser** shape: PublicUser + `email` + `usernameChangeAllowedAt` (Date or null).
- **Avatars:** the uploaded profile picture, or - if there is none - initials on a coloured circle, with the colour derived from the username. Picture and bio are visible to any logged-in user who has the user's id (i.e. anyone who searched their exact username).

### Friendship (exactly one document per pair of users)

| Field | Rules |
|---|---|
| `pairKey` | String, unique. The two user ids sorted and joined with `_` (see `utils/pairKey.js`). A→B and B→A produce the same key, so duplicate or crossed requests are impossible at database level. |
| `requester` | ObjectId → User |
| `recipient` | ObjectId → User |
| `status` | `'pending' \| 'accepted' \| 'declined'` |
| `respondedAt` | Date |
| timestamps | |

Indexes: `{ recipient: 1, status: 1 }`, `{ requester: 1, status: 1 }`.

### Conversation

| Field | Rules |
|---|---|
| `participants` | `[ObjectId, ObjectId]`, sorted |
| `pairKey` | String, unique |
| `lastMessage` | `{ text, sender, createdAt, attachment: { kind, name } \| null }` for the sidebar preview |
| timestamps | |

The conversation is created when a request is accepted, by upserting on `pairKey` with `$setOnInsert`. If the pair becomes friends again later, the old conversation and history are reused.

### Message

| Field | Rules |
|---|---|
| `conversation` | ObjectId → Conversation |
| `sender` | ObjectId → User |
| `text` | String, trimmed, 0–2000 characters. May be empty only if there is an attachment. |
| `attachment` | ObjectId → Attachment, or null |
| `clientId` | String (a UUID generated by the browser) |
| timestamps | |

Indexes: `{ conversation: 1, _id: -1 }`, and a unique index on `{ sender: 1, clientId: 1 }` (this makes retries idempotent).

Message payload sent to clients: `{ id, conversationId, senderId, text, clientId, attachment, createdAt }`, where `attachment` is null or `{ id, name, mimeType, size, kind, url }`.

### Attachment

| Field | Rules |
|---|---|
| `uploader` | ObjectId → User |
| `conversation` | ObjectId → Conversation |
| `fileId` | ObjectId of the bytes in GridFS (bucket `uploads`) |
| `name` | String, the original file name (base name only, control characters removed), max 200 |
| `mimeType` | String, **detected from the file's bytes**, never from the name or the browser |
| `size` | Number (bytes) |
| `kind` | `'image' \| 'video' \| 'file'` |
| `message` | ObjectId → Message, or null until a message uses it. One attachment belongs to at most one message. |
| timestamps | |

Index: `{ message: 1, createdAt: 1 }` (cleanup of unsent uploads).

---

## Authentication rules

- **Register** `{ username, displayName, email, password }`:
  - Validate with zod.
  - Lowercase and trim the username and email.
  - Password must be 8–72 characters (bcrypt only uses the first 72 bytes).
  - Hash with bcryptjs, cost 12.
  - Rely on the unique indexes, not on "check then insert". Map Mongo error code 11000 to 409 with "Username already taken" or "Email already registered".
- **Login** `{ identifier, password }`:
  - `identifier` can be a username or an email.
  - An unknown user and a wrong password return the **same** response: 401 "Invalid credentials".
- **Session token:**
  - JWT `{ sub: userId }`, expires in 7 days, signed with `JWT_SECRET`.
  - Sent as a cookie named `token`: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production, `maxAge` of 7 days, `path: '/'`.
  - Never put the token in localStorage or in a response body.
- **`requireAuth` middleware:** verifies the cookie, loads the user and sets `req.user`. Every route uses it except health, register, login and logout.
- **Logout:** clears the cookie.

---

## Friend system rules (MOST IMPORTANT)

### Search

`GET /api/users/search?username=`

- **Exact match on the normalised username only.** No partial, regex or prefix search. Partial search would let anyone list all users, which defeats the purpose of the feature.
- **Response:** `{ user: PublicUser, relationship }`, or 404 `{ message: "No user found" }`.
- **`relationship`** is one of `'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'`. A declined friendship shows as `'none'` to both sides.

### Send request

`POST /api/friends/requests { username }`. Checks run in this order:

1. The target doesn't exist → 404 "No user found".
2. The target is me → 400 "You can't add yourself".
3. Look up the Friendship by `pairKey`:
   - **No document:** create one with `status: 'pending'` and `requester = me`.
   - **Pending, and I am the requester:** 409 "Request already sent".
   - **Pending, and they are the requester:** accept it using the same accept flow, and return the new friend. They already asked me, so my request means yes.
   - **Accepted:** 409 "Already friends".
   - **Declined, where I was the requester and they declined within the last 7 days:** 429 "You can send another request later".
   - **Declined, any other case:** reset the same document to pending with `requester = me`, `recipient = them`.
4. If the create fails with a duplicate-key race (error 11000), treat it as "Request already sent".
5. After creating the request, call `emitToUser(recipient, 'friend:request:new', { request })`.

### Accept

`POST /api/friends/requests/:id/accept`

1. Run ONE atomic operation: `findOneAndUpdate({ _id, recipient: me, status: 'pending' }, { status: 'accepted', respondedAt: now }, { new: true })`.
   - Including `recipient: me` means only the receiver can accept.
   - Including `status: 'pending'` means a double click can't accept twice.
   - If it returns `null`, respond 404.
2. Upsert the Conversation by `pairKey`.
3. Emit `friend:request:accepted` to the requester (and to my own other tabs) with the new friend-list item.
4. If either user is online, send each of them a `presence:update` about the other.

### Decline, cancel and unfriend

- **Decline:** `POST /api/friends/requests/:id/decline`. Same atomic pattern, setting `status: 'declined'`. The requester is **not** notified.
- **Cancel:** `DELETE /api/friends/requests/:id`. Only the requester can cancel, and only while the request is pending. Delete the document, then emit `friend:request:cancelled { requestId }` to the recipient.
- **Unfriend:** `DELETE /api/friends/:userId`. Delete the accepted Friendship, but keep the Conversation and its messages. Emit `friend:removed { userId }` to both users. After this, the chat becomes read-only automatically because sending checks friendship.

### Lists

- **`GET /api/friends`** returns `{ friends: [{ friend: PublicUser, conversationId, lastMessage, online, lastSeen }] }`, sorted by the most recent `lastMessage.createdAt` (friends with no messages go last, newest friendship first).
- **`GET /api/friends/requests`** returns `{ incoming: [...], outgoing: [...] }`. Each item is `{ id, user: PublicUser, createdAt }`.

### Enforcement (never skip)

Hiding users in the UI is **not** security, because anyone can call the API directly. `friendService` exports two helpers:

- **`assertParticipant(conversationId, userId)`** returns the conversation, or throws **404**. It's 404 rather than 403 so outsiders can't learn which conversations exist.
- **`assertFriends(userA, userB)`** throws **403** "You can only message friends".

Every REST route and socket handler that reads or writes messages MUST call these. Presence events go **only** to friends.

---

## Profile rules

- **`PATCH /api/users/me`** `{ displayName?, bio?, username? }` - validated with zod; unknown fields are stripped (email and password can never be changed here).
- **Username change:**
  - Same regex and normalisation as registration. The unique index guards duplicates: error 11000 → 409 "Username already taken".
  - At most once every 30 days. The cooldown is part of the SAME atomic `findOneAndUpdate` filter (`usernameChangedAt` null or older than 30 days), so two simultaneous changes cannot both pass. Blocked → 429 "You can change your username again on YYYY-MM-DD".
  - Sending the current username is not a change and does not start the cooldown.
  - The old username becomes free for anyone to take. The client warns about this before saving.
- **Profile picture:** `PUT /api/users/me/avatar` (multipart field `avatar`, max 2 MB, JPEG/PNG/WebP/GIF by magic bytes). The browser crops it to 256×256 before upload. Replacing or removing it deletes the old GridFS file.
- **`GET /api/users/:id/avatar`** - any logged-in user. Cached for a year when `?v=` matches the current file id, otherwise `no-cache`.
- After any profile change, emit `user:updated { user: PublicUser }` to everyone with a friendship or pending request with this user, and `user:updated { user: SelfUser }` to the user's own room.

---

## Attachment rules

Sending a file is **two steps**, so the rule "sending happens only through `message:send`" still holds:

1. **Upload:** `POST /api/conversations/:id/attachments` (multipart field `file`). Order: rate limit → valid id → `assertParticipant` + `assertFriends` (**before** the body is read, so strangers cannot make the server receive a file) → multer (memory, max 25 MB) → detect the type by magic bytes → per-kind size limit → store in GridFS → create the Attachment with `message: null` → 201 `{ attachment }`.
2. **Send:** `message:send { conversationId, text?, clientId, attachmentId }`. The claim is ONE atomic `findOneAndUpdate({ _id, uploader: me, conversation, message: null }, { message: newMessageId })` - so nobody can send someone else's upload, move it to another chat, or use one upload twice. Failure → ack `{ ok: false, error: 'Attachment not found' }`.

- **Allowed types (by magic bytes):** images JPEG, PNG, GIF, WebP; videos MP4, WebM, MOV; documents PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ZIP (ZIP and OLE files are labelled by extension), TXT (must be valid UTF-8 with no NUL bytes). **Never SVG or HTML** (they can run scripts).
- **Size limits:** images and documents 10 MB, videos 25 MB. Too large → 413 "File is too large". Wrong type → 400 "This file type is not supported".
- **Download:** `GET /api/attachments/:id` → requireAuth → the requester must be a participant (404 otherwise, never 403); an unsent upload is visible only to its uploader. Supports HTTP `Range` (206 / 416) for video seeking. `Content-Type` is always the detected type, set after `res.attachment()`. Images and videos are served `inline`; documents always `Content-Disposition: attachment`. `Cache-Control: private, max-age=86400`.
- After an unfriend, both people can still download files already in the chat (history stays readable), but cannot upload new ones.
- **Cleanup:** uploads never used by a message are deleted after 1 hour (on startup, then hourly). Delete the document first (only if still unsent), then the GridFS file.
- **CSP:** helmet's default policy plus `blob:` in `img-src` and `media-src`, so the chosen file can be previewed before upload.

---

## Messaging rules

### History

`GET /api/conversations/:id/messages?before=<messageId>&limit=30`

- `limit` defaults to 30, with a maximum of 50.
- Always call `assertParticipant` first.
- Query `_id < before` (all messages if `before` is omitted), sort by `_id` descending, and fetch `limit + 1` rows.
- Return `{ messages, hasMore }`, with `messages` ordered oldest → newest.
- Never use skip/offset pagination.

### Sending

Sending happens **only** through the socket event `message:send`, with an acknowledgement. The order below is mandatory:

1. Validate with zod (text may be empty only when `attachmentId` is given).
2. `assertParticipant`.
3. `assertFriends`.
4. Claim the attachment (if any) and save the Message.
5. Update `Conversation.lastMessage`.
6. Emit.
7. Acknowledge.

If anything fails before the save, nothing is emitted and the handler calls `ack({ ok: false, error })`. This guarantees a message is never shown on screen without being saved.

- **Idempotency:** if a message with the same `(sender, clientId)` already exists, return it instead of creating a duplicate. This covers retries after a timeout.
- **Emit call:** `socket.to('user:' + otherId).to('user:' + me).emit('message:new', msg)`. This reaches the recipient and my *other* tabs, but not the sending tab, which receives the ack instead.
- **Offline recipient:** the emit reaches nobody, but the message is stored and they will see it when they load the conversation.

---

## Real-time (Socket.IO) rules

- Attach Socket.IO to the same `http.Server` as Express, using the default path `/socket.io`.
- **Handshake authentication** in `io.use()`:
  - Parse the `token` cookie from `socket.handshake.headers.cookie` using the `cookie` package.
  - Verify the JWT and check that the user exists.
  - Set `socket.data.userId`. If anything fails, call `next(new Error('Unauthorized'))`.
- **Rooms:** on connection, run `socket.join('user:' + userId)`. Always emit to rooms; never store socket ids.
- **Presence** (`presenceService`, an in-memory `Map` of userId → number of open connections):
  - **On connect:** increment the count. If it just became 1, emit `presence:update { userId, online: true }` to each friend's room. Always send the connecting socket `presence:snapshot { online: [friendIds that are online] }`.
  - **On disconnect:** decrement the count. If it just became 0, save `lastSeen` to the database and emit `presence:update { userId, online: false, lastSeen }` to friends.
  - **Friend ids:** look them up from the database when needed. Don't keep long-lived cached lists that can go stale.
  - **Why counting:** with two tabs open, closing one must NOT show the user as offline.
- **Every socket handler must:**
  - Validate its payload.
  - Check `typeof ack === 'function'`.
  - Wrap its work in try/catch.
  - Never crash the process.
- **Rate limit** `message:send` per socket: at most 10 messages per 5 seconds. Beyond that, respond `ack({ ok: false, error: 'Slow down' })`.
- **Scaling:** this is a single-instance design, because presence is kept in memory. The README must state that running multiple instances would need the Socket.IO Redis adapter and a shared presence store.

---

## Socket events contract

| Event | Direction | Payload |
|---|---|---|
| `message:send` | client → server, with ack | `{ conversationId, text?, clientId, attachmentId? }` → ack `{ ok: true, message }` or `{ ok: false, error }` |
| `message:new` | server → client | Message payload |
| `presence:snapshot` | server → client | `{ online: [userId] }` |
| `presence:update` | server → client | `{ userId, online, lastSeen? }` |
| `friend:request:new` | server → client | `{ request: { id, user, createdAt } }` |
| `friend:request:accepted` | server → client | `{ friend: FriendListItem }` |
| `friend:request:cancelled` | server → client | `{ requestId }` |
| `friend:removed` | server → client | `{ userId }` |
| `user:updated` | server → client | `{ user }` - PublicUser to contacts, SelfUser to the user's own tabs |

---

## REST API contract

All responses are JSON (except the two file downloads). Errors use the shape `{ message }` with the right status code: 400 validation, 401, 403, 404, 409, 413, 416, 429, 500.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | no | `{ status: 'ok' }` |
| POST | `/api/auth/register` | no | Sets the cookie, returns `{ user }` |
| POST | `/api/auth/login` | no | Sets the cookie, returns `{ user }` |
| POST | `/api/auth/logout` | no | Clears the cookie, returns 204 |
| GET | `/api/auth/me` | yes | `{ user }` (my own profile, including email) |
| GET | `/api/users/search?username=` | yes | `{ user, relationship }` |
| GET | `/api/friends` | yes | `{ friends }` |
| DELETE | `/api/friends/:userId` | yes | Unfriend, returns 204 |
| GET | `/api/friends/requests` | yes | `{ incoming, outgoing }` |
| POST | `/api/friends/requests` | yes | `{ username }` → 201 `{ request }`, or 200 `{ friend }` if auto-accepted |
| POST | `/api/friends/requests/:id/accept` | yes | `{ friend }` |
| POST | `/api/friends/requests/:id/decline` | yes | 204 |
| DELETE | `/api/friends/requests/:id` | yes | Cancel, returns 204 |
| GET | `/api/conversations/:id/messages` | yes | `{ messages, hasMore }` |
| PATCH | `/api/users/me` | yes | `{ displayName?, bio?, username? }` → `{ user }` (SelfUser) |
| PUT | `/api/users/me/avatar` | yes | multipart `avatar` → `{ user }` |
| DELETE | `/api/users/me/avatar` | yes | `{ user }` |
| GET | `/api/users/:id/avatar` | yes | The picture (image bytes) |
| POST | `/api/conversations/:id/attachments` | yes | multipart `file` → 201 `{ attachment }` |
| GET | `/api/attachments/:id` | yes | The file (bytes, Range supported) |

---

## Security checklist (must hold at all times)

- `helmet`, and `express.json({ limit: '10kb' })`.
- zod validation on every body, query, params and socket payload. This also blocks NoSQL operator injection such as `{ "$gt": "" }`.
- **Rate limits:**
  - Register and login: 10 per 15 minutes per IP.
  - Search: 30 per minute per user.
  - Friend requests: 20 per hour per user.
  - Profile changes and picture uploads: 20 per hour per user.
  - Attachment uploads: 20 per hour per user.
  - Socket messages: as described above.
- **Uploads:** type checked by magic bytes against an allowlist (no SVG/HTML); size limited while streaming; never written to the server's disk; every download permission-checked; documents never rendered inline; `nosniff` (helmet).
- `passwordHash` never appears in any response. Other users only ever receive the PublicUser shape.
- No `dangerouslySetInnerHTML` anywhere. Render message text as plain text with `white-space: pre-wrap`.
- Secrets only in environment variables. Never log passwords, tokens or cookies.
- In production: `trust proxy` is set and cookies are `secure`.
- `npm audit` has no high or critical issues.

---

## Client rules

### Routes and session

- Routes: `/login`, `/register`, and `/` (the protected chat app). Unknown routes redirect to `/`.
- **AuthContext:** calls `GET /api/auth/me` on load and shows a full-screen spinner until it resolves. There must be no flash of the login page for users who are already logged in.
- **axios instance:** `baseURL: '/api'`, `withCredentials: true`. On a 401 from any call except `/auth/me`, clear the user and go to `/login`.

### Sockets and state

- **SocketProvider:** creates exactly one socket per logged-in session, after login, with `io({ withCredentials: true })`. It disconnects on logout.
- **`useSocketEvents`:** all socket listeners are registered in this one hook, inside `useEffect`, with `socket.off` in the cleanup. React StrictMode runs effects twice in development, so without cleanup every message would appear twice.
- **zustand store** holds: `friends`, `requests`, `messagesByConversation`, `presence`, `activeConversationId` and `unreadCounts`.

### Layout

- A sidebar with the tabs **Chats | Requests (with a badge) | Add Friend**, next to a chat panel.
- Below 768px, show either the list or the chat, with a back button.

### Sidebar tabs

- **Chats:**
  - Each friend shows an avatar, displayName, an online dot, a last-message preview, the time and an unread badge.
  - **Empty state:** "No friends yet", plus my `@username` with a copy button, plus a button that opens the Add Friend tab.
- **Requests:**
  - Incoming requests with Accept and Decline buttons.
  - Outgoing requests with a Cancel button.
  - Empty states for both lists.
- **Add Friend:**
  - One input for exact username search, showing a single result card.
  - The card's button depends on `relationship`:

    | relationship | Button |
    |---|---|
    | `none` | Add friend |
    | `pending_outgoing` | Requested · Cancel |
    | `pending_incoming` | Accept / Decline |
    | `friends` | Message |
    | `self` | "This is you" |

  - A 404 response shows "No user found".

### Chat window

- **Header:** the friend's name, with "Online" or "Last seen …".
- **Message list:**
  - My messages on the right, theirs on the left, with the time on each.
  - Date separators: Today, Yesterday, then dates.
- **Input:**
  - Enter sends; Shift+Enter adds a new line.
  - 2000-character limit, with a counter shown near the limit.
- **Optimistic sending:**
  - Add the bubble immediately with a `clientId` from `crypto.randomUUID()` and the status `sending`.
  - Replace it when the ack returns `ok`.
  - Mark it `failed` with a Retry button (which resends with the same `clientId`) if the ack fails or doesn't arrive within 10 seconds.
- **Deduplication:** ignore incoming messages whose `id` or `clientId` is already in the list.
- **Scrolling:**
  - Auto-scroll only if the user is near the bottom; otherwise show a "New messages ↓" pill.
  - Scrolling to the top loads older messages while keeping the scroll position steady.
- **Reconnection:** show a "Reconnecting…" banner while disconnected. On a reconnect (not the first connect), refetch friends, requests and the open conversation's latest page.
- **Toasts:** a new friend request, a request accepted, and errors.

### Profile

- The sidebar footer (my avatar and name) opens a **Your profile** dialog: photo (Add/Change/Remove - saved immediately, cropped to 256×256 in the browser), display name, username, bio (160 max, with a counter), email (read-only). Save sends only the changed fields.
- Changing the username asks for confirmation (30-day lock, old name becomes available). While locked, the field is disabled and says until when.
- Clicking a friend's picture or name in the chat header opens their profile (picture, name, @username, bio). The Add Friend result card shows the bio.
- `user:updated` updates that person everywhere they appear (Chats, Requests, chat header), or my own profile if it is me.
- Dialogs use the native `<dialog>` element (`showModal`): focus trap, Escape and backdrop click close it.

### Attachments

- A paperclip button opens the file picker (`accept` = the allowlist). The client pre-checks type and size for quick feedback; the server is the real check.
- The chosen file shows above the input (thumbnail or icon, name, size, Remove); the text becomes an optional caption.
- Sending: the bubble appears at once (status `uploading` with a progress bar, previewed from a `blob:` URL), then `sending` after the upload, then saved. An upload or ack failure → `failed` with Retry; Retry skips the upload if it already succeeded. Blob URLs are revoked when no longer needed.
- Photos show as thumbnails that open full size in a dialog; videos play inline with controls; documents are a card with name, size and a download link.
- Sidebar preview: "📷 caption or Photo", "🎥 caption or Video", "📄 file name".

### Style

Clean and simple, like a modern messenger (blue primary colour, white and light-grey surfaces). Use accessible labels, visible focus rings, good contrast and full keyboard use.

---

## Testing rules

- Every endpoint and socket handler gets tests for the success case and the main failure cases.
- Server tests use mongodb-memory-server. `app.js` exports the app without calling `listen`, so Supertest can use it directly.
- `docs/TEST_CASES.md` lists every automated case and a manual test table (ID, scenario, steps, expected, actual, pass/fail). Keep it updated.
- Run `npm test` and `npm run lint` before saying any phase is done.

---

## Working agreement (how to work in this repo)

1. Work on **one phase at a time**, and only on what I ask for.
2. **Before writing code**, show a short plan (the files to create or change, and the key decisions), then wait for my OK.
3. **After coding:**
   - Run the tests and lint, and fix any failures.
   - Tell me (a) what changed, and (b) exactly how to verify it manually, step by step, in the browser or Postman.
4. At the end of every phase, update **`docs/PROGRESS.md`** with the phase checklist, what is done and any known issues. A new session must be able to continue from it.
5. For every phase, add a section to **`docs/EXPLAINED.md`**: a simple English explanation of how it works and why each decision was made, for our viva.
6. **Never commit `.env` or secrets.** Never print `.env` contents. Never run destructive commands (deleting folders, `git push --force`, dropping databases) without asking.
7. When I paste an error, **find the root cause first**, explain it in 1–2 sentences, then fix it. Add a test so it can't come back, where possible.
8. Commit at the end of each phase with a clear message, but **only after I confirm it works.**
