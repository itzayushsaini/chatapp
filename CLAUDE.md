# CLAUDE.md — ChatApp (Real-time chat, MERN + Socket.IO)

## What this project is

A web-based, one-to-one, real-time text chat app. It is a B.Tech CSE final-year project built by a team of 4 at COER University.

The key feature: **users cannot see everyone who has an account.** A user finds another person by searching their **exact username**, sends a **friend request**, and the two can chat only after the request is **accepted**.

Two things matter as much as working code:

1. **The team must be able to explain every file in a viva.** Prefer simple, readable code over clever code. Add short comments that explain *why* wherever it isn't obvious. Avoid unnecessary abstractions and extra libraries.
2. **It must be real-world ready**: secure, tested and deployable.

Do not add features that are not listed here. If something seems missing, or a rule seems wrong, ask before changing it.

---

## Tech stack (fixed — do not change without asking)

- **Server:** Node.js (current LTS), Express 5, Mongoose, Socket.IO 4, zod, bcryptjs, jsonwebtoken, cookie-parser, cookie, helmet, express-rate-limit, morgan.
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
chat-app/
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
      models/        User.js, Friendship.js, Conversation.js, Message.js
      services/      authService.js, friendService.js, messageService.js, presenceService.js
      controllers/   auth, users, friends, conversations
      routes/        auth.routes.js, users.routes.js, friends.routes.js, conversations.routes.js
      middleware/    requireAuth.js, validate.js, rateLimits.js, errorHandler.js, notFound.js
      socket/        index.js, socketAuth.js, emitter.js, handlers/
      utils/         AppError.js, pairKey.js, publicUser.js
      scripts/       seed.js
      app.js         # builds and exports the Express app (does NOT listen) — used by tests
      server.js      # http server + Socket.IO + DB connect + listen + graceful shutdown
    tests/
  client/
    package.json
    vite.config.js
    src/
      api/           http.js (axios instance), auth.js, friends.js, conversations.js
      store/         useChatStore.js (zustand)
      context/       AuthContext.jsx, SocketContext.jsx
      hooks/         useSocketEvents.js
      pages/         LoginPage.jsx, RegisterPage.jsx, ChatPage.jsx
      components/    layout/, sidebar/, chat/, common/
      utils/         time.js, avatar.js
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
| `username` | String, required, unique, lowercase, trimmed, must match `/^[a-z0-9_.]{3,20}$/`. This is the public ID people search for. It cannot be changed. |
| `displayName` | String, 1–40 characters |
| `email` | String, required, unique, lowercase, trimmed |
| `passwordHash` | String, `select: false` |
| `lastSeen` | Date |
| timestamps | |

- **PublicUser shape:** `{ id, username, displayName }`. These are the ONLY fields ever sent about another user.
- **Friends-only fields:** `online` and `lastSeen` are sent only to friends.
- **Email:** only ever sent to the user themself (via `/api/auth/me`).
- **Avatars:** initials on a coloured circle, with the colour derived from the username. No image uploads.

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
| `lastMessage` | `{ text, sender, createdAt }` for the sidebar preview |
| timestamps | |

The conversation is created when a request is accepted, by upserting on `pairKey` with `$setOnInsert`. If the pair becomes friends again later, the old conversation and history are reused.

### Message

| Field | Rules |
|---|---|
| `conversation` | ObjectId → Conversation |
| `sender` | ObjectId → User |
| `text` | String, trimmed, 1–2000 characters |
| `clientId` | String (a UUID generated by the browser) |
| timestamps | |

Indexes: `{ conversation: 1, _id: -1 }`, and a unique index on `{ sender: 1, clientId: 1 }` (this makes retries idempotent).

Message payload sent to clients: `{ id, conversationId, senderId, text, clientId, createdAt }`.

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

1. Validate with zod.
2. `assertParticipant`.
3. `assertFriends`.
4. Save the Message.
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
| `message:send` | client → server, with ack | `{ conversationId, text, clientId }` → ack `{ ok: true, message }` or `{ ok: false, error }` |
| `message:new` | server → client | Message payload |
| `presence:snapshot` | server → client | `{ online: [userId] }` |
| `presence:update` | server → client | `{ userId, online, lastSeen? }` |
| `friend:request:new` | server → client | `{ request: { id, user, createdAt } }` |
| `friend:request:accepted` | server → client | `{ friend: FriendListItem }` |
| `friend:request:cancelled` | server → client | `{ requestId }` |
| `friend:removed` | server → client | `{ userId }` |

---

## REST API contract

All responses are JSON. Errors use the shape `{ message }` with the right status code: 400 validation, 401, 403, 404, 409, 429, 500.

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

---

## Security checklist (must hold at all times)

- `helmet`, and `express.json({ limit: '10kb' })`.
- zod validation on every body, query, params and socket payload. This also blocks NoSQL operator injection such as `{ "$gt": "" }`.
- **Rate limits:**
  - Register and login: 10 per 15 minutes per IP.
  - Search: 30 per minute per user.
  - Friend requests: 20 per hour per user.
  - Socket messages: as described above.
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
