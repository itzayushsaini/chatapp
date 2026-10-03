# CLAUDE.md — PingMe (Real-time chat, MERN + Socket.IO)

## What this project is

A web-based, one-to-one, real-time text chat app. It is a B.Tech CSE 2nd-year project built by a team of 4 at COER University.

The key feature: **users cannot see everyone who has an account.** A user finds another person by searching their **exact username**, sends a **friend request**, and the two can chat only after the request is **accepted**.

Two things matter as much as working code:

1. **The team must be able to explain every file in a viva.** Prefer simple, readable code over clever code. Add short comments that explain *why* wherever it isn't obvious. Avoid unnecessary abstractions and extra libraries.
2. **It must be real-world ready**: secure, tested and deployable.

Do not add features that are not listed here. If something seems missing, or a rule seems wrong, ask before changing it.

---

## Tech stack (fixed — do not change without asking)

- **Server:** Node.js (current LTS), Express 5, Mongoose, Socket.IO 4, zod, bcryptjs, jsonwebtoken, cookie-parser, cookie, helmet, express-rate-limit, morgan, multer (file uploads).
- **Password-reset email:** sent via the Brevo API using Node's built-in `fetch` - no extra library.
- **PingMe AI:** Google Gemini through Google's official SDK, `@google/genai` (the one place a vendor SDK is used: streaming, reasoning summaries and file input are what it handles for us). Only `services/geminiClient.js` imports it.
- **Push notifications (while PingMe is closed):** Web Push with `web-push` (it does the RFC 8291 encryption and VAPID signing - not something to hand-write). Only `services/pushService.js` imports it.
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
      models/        User.js, Friendship.js, Conversation.js, Message.js, Attachment.js, Setting.js, Block.js,
                     Update.js, AiMessage.js, PushSubscription.js
      services/      authService.js, friendService.js, messageService.js, presenceService.js,
                     profileService.js, attachmentService.js, storageService.js, emailService.js,
                     settingsService.js, adminService.js, googleAuthService.js, updateService.js,
                     aiService.js, geminiClient.js (the ONLY file that talks to Google's Gemini),
                     pushService.js (Web Push - the ONLY file that sends pushes)
      controllers/   auth, users, friends, conversations, attachments, admin, updates, ai, push
      routes/        auth.routes.js, users.routes.js, friends.routes.js, conversations.routes.js,
                     attachments.routes.js, settings.routes.js, admin.routes.js, updates.routes.js,
                     ai.routes.js, push.routes.js
      middleware/    requireAuth.js, requireAdmin.js, validate.js, rateLimits.js, upload.js,
                     errorHandler.js, notFound.js
      socket/        index.js, socketAuth.js, emitter.js, handlers/
      utils/         AppError.js, pairKey.js, publicUser.js, fileType.js, sendStoredFile.js, fileName.js
      scripts/       seed.js, makeAdmin.js
      app.js         # builds and exports the Express app (does NOT listen) — used by tests
      server.js      # http server + Socket.IO + DB connect + listen + graceful shutdown
    tests/
  client/
    package.json
    vite.config.js
    src/
      api/           http.js (axios instance), auth.js, friends.js, conversations.js, profile.js,
                     settings.js, admin.js, updates.js, ai.js, push.js
      store/         useChatStore.js (zustand)
      context/       AuthContext.jsx, SocketContext.jsx
      hooks/         useSocketEvents.js, useFriendStatus.js, useVoiceRecorder.js, useInstallApp.js
      pages/         LandingPage.jsx, LoginPage.jsx, RegisterPage.jsx, ChatPage.jsx, SettingsPage.jsx, AdminPage.jsx
      components/    layout/, sidebar/, chat/, profile/, admin/, landing/ (ChatPreview.jsx),
                     updates/ (UpdatesRow.jsx, UpdatesChannel.jsx, PingMeAvatar.jsx),
                     ai/ (AiRow.jsx, AiChat.jsx, AiBubble.jsx, AiComposer.jsx, AiAvatar.jsx,
                     Markdown.jsx - the safe Markdown renderer for answers),
                     common/ (incl. AnnouncementBanner.jsx, buttonClass.js, InstallAppDialog.jsx),
                     sidebar/ (incl. NotificationPrompt.jsx, InstallPrompt.jsx)
      utils/         time.js, avatar.js, files.js, image.js, notifications.js, theme.js, preferences.js,
                     install.js (installing as an app), push.js (Web Push subscription)
    public/          favicon.svg, manifest.webmanifest (the installable app), icons/ (app icons),
                     sw.js (service worker: notifications, push, the offline page), offline.html,
                     theme-init.js (applies the saved theme before React loads)
    (components/common/TypingDots.jsx - the animated "typing…" dots)
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
| `npm run make-admin -- <username>` | Grants `isAdmin` to an existing account - bootstraps the very first admin, since there is no panel yet to grant it from |

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

# Password-reset email (Brevo). Optional - without it, forgot-password
# still answers normally but silently does not send anything (logged).
BREVO_API_KEY=
EMAIL_FROM_ADDRESS=  # must be a sender verified in Brevo
EMAIL_FROM_NAME=PingMe
APP_URL=http://localhost:5173  # set to the deployed URL in production

# "Continue with Google". Optional - without both, the button is not shown.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# PingMe AI (Google Gemini). Optional - without a key, PingMe AI is hidden.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash               # default
GEMINI_FALLBACK_MODEL=gemini-3.5-flash      # default; tried when the main one is busy
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image   # default; "Imagine" only (paid plans)

# Push notifications while PingMe is closed (Web Push). Optional - without
# both keys, notifications only arrive while the app is open.
# Make the pair once with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=        # optional https: or mailto: address; defaults to APP_URL if https
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
| `passwordHash` | String, `select: false`. Absent for an account created by Google sign-in until they set a password via "Forgot password". |
| `authProvider` | `'password' \| 'google'`, default `'password'` - how the account was CREATED (never changes). |
| `googleId` | String, unique + sparse (only accounts that used Google have one). Google's own id for the person (`sub`). |
| `theme` | `'light' \| 'dark' \| 'system'`, default `'light'`. Saved on the account so it follows the user to every device. |
| `passwordChangedAt` | Date or null. Set on every password change or reset. Any session token issued before this moment is rejected (see Session token rules) - this is what signs every OTHER device out. |
| `resetPasswordTokenHash` | String, `select: false`, default null. SHA-256 hash of the one-time reset token - never the raw token. |
| `resetPasswordExpires` | Date, `select: false`, default null |
| `lastSeen` | Date |
| `updatesReadUpTo` | ObjectId → Update, or null. How far I have read the "PingMe" updates channel - one forward-only pointer, like `Conversation.lastRead`. Never sent to other users. |
| `isAdmin` | Boolean, default false. Grants access to the admin panel. Sent to the client only in **SelfUser** (never PublicUser - other users have no reason to know it). |
| `suspended` | Boolean, default false. Set by an admin. Blocks login (403) and invalidates any EXISTING session the instant it is set - see `userFromToken` and the Admin panel section below. |
| timestamps | |

- **PublicUser shape:** `{ id, username, displayName, bio, avatarUrl }`. These are the ONLY fields ever sent about another user. `avatarUrl` is `/api/users/:id/avatar?v=<avatarFileId>` or null.
- **Friends-only fields:** `online` and `lastSeen` are sent only to friends.
- **Email:** only ever sent to the user themself (via `/api/auth/me`), in the **SelfUser** shape: PublicUser + `email` + `usernameChangeAllowedAt` (Date or null) + `isAdmin` + `theme` + `authProvider` + `googleLinked` (boolean - whether Google sign-in works for this account).
- **AdminUser shape** (admin panel's own user list only): `{ id, username, displayName, email, isAdmin, suspended, online, lastSeen, createdAt }` - more detail than PublicUser/SelfUser, but still never `passwordHash` or any password/reset field.
- **Avatars:** the uploaded profile picture, or - if there is none - initials on a coloured circle, with the colour derived from the username. Picture and bio are visible to any logged-in user who has the user's id (i.e. anyone who searched their exact username).

### Block

| Field | Rules |
|---|---|
| `blocker` | ObjectId → User |
| `blocked` | ObjectId → User |
| timestamps | |

Unique index `{ blocker: 1, blocked: 1 }`, index `{ blocked: 1 }`. See "Blocking" in the friend rules.

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
| `lastMessage` | `{ messageId, text, sender, createdAt, attachment: { kind, name } \| null }` for the sidebar preview. `messageId` lets a delete tell whether IT is the current preview and needs recomputing. |
| `lastRead` | Map, keyed by user id (a string) → `{ upTo: ObjectId, at: Date }`. Only 2 entries ever exist - one per participant. How far each has read, tracked per conversation rather than per message. |
| `mutedBy` | `[ObjectId]` - the participants who muted this chat (no notification pop-ups for them). Per person; never visible to the other one. |
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
| `replyTo` | `{ messageId, senderId, textSnippet, attachmentKind } \| null`. A SNAPSHOT taken when the reply is sent, not a live reference - see "Message actions" below. |
| `deletedForEveryone` | Boolean, default false. A soft delete - the row and its text/attachment stay in the database; every read path hides them once true. |
| `deletedFor` | `[ObjectId]`, default `[]`. User ids who chose "delete for me" - hidden on their devices only. |
| `forwarded` | Boolean, default false. True for a message created by forwarding another one. |
| timestamps | |

Indexes: `{ conversation: 1, _id: -1 }`, and a unique index on `{ sender: 1, clientId: 1 }` (this makes retries idempotent).

Message payload sent to clients: `{ id, conversationId, senderId, text, clientId, attachment, replyTo, forwarded, deletedForEveryone, createdAt }`, where `attachment` is null or `{ id, name, mimeType, size, kind, url }` (plus `durationMs` and `waveform` when `kind` is `'audio'`). When `deletedForEveryone` is true, `text` is `''` and `attachment` is `null` regardless of what is actually stored - callers never see the deleted content.

Read status is **not** stored per message - see "Read receipts" below.

### Attachment

| Field | Rules |
|---|---|
| `uploader` | ObjectId → User |
| `conversation` | ObjectId → Conversation |
| `fileId` | ObjectId of the bytes in GridFS (bucket `uploads`) |
| `name` | String, the original file name (base name only, control characters removed), max 200 |
| `mimeType` | String, **detected from the file's bytes**, never from the name or the browser |
| `size` | Number (bytes) |
| `kind` | `'image' \| 'video' \| 'audio' \| 'file'` - `audio` is a voice note |
| `durationMs` | Number or null, 0-300000. Voice notes only, **display only**: the length the sender's browser measured while recording (many recordings don't state their own). |
| `waveform` | `[Number]` (0-100 each, max 64 bars) or absent. Voice notes only, display only: the loudness shape measured while recording. |
| `message` | ObjectId → Message, or null until a message uses it. One attachment belongs to at most one message. |
| timestamps | |

Index: `{ message: 1, createdAt: 1 }` (cleanup of unsent uploads).

### Update (a post in the "PingMe" updates channel)

| Field | Rules |
|---|---|
| `text` | String, trimmed, 0-1000 characters. May be empty only if there is a photo. |
| `imageFileId` | ObjectId of the photo in GridFS (bucket `uploads`), or null. JPEG/PNG/WebP/GIF by magic bytes, max 10 MB. |
| `author` | ObjectId → User (the admin who posted). Kept for the record, **never sent to clients** - to users every post comes from "PingMe". |
| timestamps | |

Update payload sent to clients: `{ id, text, imageUrl, createdAt }`, where `imageUrl` is `/api/updates/:id/image` or null. Deliberately NOT a Message from a fake "PingMe" user - see "Updates channel".

### AiMessage (one message in a user's private chat with PingMe AI)

| Field | Rules |
|---|---|
| `user` | ObjectId → User - the owner, the ONLY person who can ever see it |
| `role` | `'user'` (a question) \| `'model'` (PingMe AI's answer) - Gemini's own two words |
| `text` | String. A question is 0-4000 characters (empty only with a file); an answer's length is capped by `maxOutputTokens`. |
| `reasoning` | String, default `''`. Answers only: Gemini's thought summary ("Show reasoning"). |
| `mode` | `'chat' \| 'think' \| 'imagine'`, default `'chat'` - normal, "Think deeper", or create a picture |
| `attachment` | Embedded `{ fileId, name, mimeType, size, kind, durationMs?, waveform?, shared }` or null - a question's photo/PDF/text/voice note/video, or an answer's created picture. `shared: true` = the bytes belong to a CHAT attachment (forwarded), so clearing the AI chat never deletes them. |
| `status` | `'streaming' \| 'done' \| 'stopped' \| 'error'`, default `'done'` (answers move from streaming to one of the others) |
| `error` | String, default `''` - for `'error'`, a sentence safe to show |
| `clientId` | String (browser UUID), questions only - unique per user (partial index), so a retried request is never saved twice |
| `forwarded` | Boolean, default false |
| timestamps | |

Indexes: `{ user: 1, _id: -1 }` (history), `{ user: 1, role: 1, createdAt: -1 }` (daily limit), unique `{ user: 1, clientId: 1 }` where `clientId` is a string.

AiMessage payload: `{ id, role, text, reasoning, mode, status, error, attachment, clientId, forwarded, createdAt, updatedAt }`, where `attachment` is null or `{ name, mimeType, size, kind, url }` (+ `durationMs`, `waveform` for audio) and `url` is `/api/ai/files/:messageId`. `updatedAt` lets the client keep the newest copy when the same message arrives twice.

### PushSubscription (one device that gets push notifications)

| Field | Rules |
|---|---|
| `user` | ObjectId → User (index) |
| `endpoint` | String, **unique** - the device's address at its browser maker's push service. Must be `https:` on an allow-listed push service host (FCM, Mozilla, Apple, Windows). If another account subscribes the same endpoint (shared browser), it moves to them. |
| `keys` | `{ p256dh, auth }` (base64url) - the device's public keys; each push is encrypted with them |
| timestamps | |

Never sent to clients. Deleted when the device unsubscribes (notifications off / logout), when a push gets 404/410 from the push service, on a password change or reset, a suspension, or an account delete.

### Setting (exactly one document ever exists)

| Field | Rules |
|---|---|
| `singletonKey` | String, unique, always `'singleton'`. Guarantees there is only ever one document - every read/write goes through the same fixed key. |
| `allowedEmailDomains` | `[String]`, default `['gmail.com']`. Registration's email must end in one of these (case-insensitive). This is also what blocks temp-mail/disposable addresses in practice, without maintaining a list of disposable-mail providers that goes stale. |
| `registrationOpen` | Boolean, default true |
| `attachmentsEnabled` | Boolean, default true |
| `forwardingEnabled` | Boolean, default true |
| `deleteForEveryoneWindowMinutes` | Number, default 60, 1-10080. Replaces a hardcoded constant - see "Delete" under Message actions. |
| `announcement` | `{ enabled: Boolean, text: String (max 200) }`, default both false/`''` |
| `aiEnabled` | Boolean, default true. PingMe AI on/off (it is also hidden without a `GEMINI_API_KEY`). |
| `aiDailyLimit` | Number, default 50, 1-1000. Answers per user in any rolling 24 hours (failed answers don't count). |
| `aiImageGenerationEnabled` | Boolean, default **false** - "Imagine" needs a paid Gemini plan. |
| timestamps | |

`settingsService.getSettings()` upserts this document on first read (`$setOnInsert`), so a brand new database just gets the schema's defaults - there is no separate "seed the settings" step. Every feature this document controls is described in its own rules section above/below; this table is just the data shape. See "Admin panel" for who may read/change it and how.

---

## Authentication rules

- **Register** `{ username, displayName, email, password }`:
  - Validate with zod.
  - Lowercase and trim the username and email.
  - **Before anything else:** `registrationOpen` must be true (403 "Registration is currently closed"), and the email's domain must be in `allowedEmailDomains` (400 "You can only sign up with an email ending in: <list>") - both admin-editable settings, not hardcoded, checked in `authService.assertRegistrationAllowed`.
  - Password must be 8–72 characters (bcrypt only uses the first 72 bytes).
  - Hash with bcryptjs, cost 12.
  - Rely on the unique indexes, not on "check then insert". Map Mongo error code 11000 to 409 with "Username already taken" or "Email already registered".
- **Login** `{ identifier, password }`:
  - `identifier` can be a username or an email.
  - An unknown user and a wrong password return the **same** response: 401 "Invalid credentials".
  - Checked AFTER the password (so this can never be used to discover whether an unknown identifier belongs to a suspended account): a suspended account gets 403 "Your account has been suspended".
- **Session token:**
  - JWT `{ sub: userId, ts: <ms epoch when signed>, rm: <remember me> }`, signed with `JWT_SECRET`. Expires in 30 days when `rm` is true, 7 days when false.
  - **Remember me** (login checkbox, `rememberMe` in the login body, default false): ticked → the cookie has a 30-day `maxAge` and survives browser restarts; unticked → NO `maxAge` (a browser-session cookie, deleted when the browser closes). Registration always behaves as ticked. A cookie reissued after a password change keeps the original choice (read back from `rm`; a token from before `rm` existed counts as ticked).
  - `ts` is a custom millisecond-precision issued-at time, separate from the JWT's own `iat` (which is whole seconds only - too coarse to reliably tell "issued just before a password change" from "issued just after", see `userFromToken`).
  - Sent as a cookie named `token`: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production, `path: '/'`, and `maxAge` only as described under Remember me.
  - Never put the token in localStorage or in a response body.
- **`requireAuth` middleware:** verifies the cookie, loads the user and sets `req.user`. Every route uses it except health, register, login, logout, forgot-password and reset-password.
- **`userFromToken`** (shared by `requireAuth` and the socket handshake): rejects a token whose `ts` is before the user's `passwordChangedAt` - a stale token from before the password changed is refused, without a server-side list of valid tokens. Also rejects (returns null) any token belonging to a **suspended** user, so an admin's suspend takes effect on the very next request or handshake, not just at the account's next login.
- **Logout:** clears the cookie. The client asks "Log out?" first (Cancel / Log out).

### Forgot password

- **`POST /api/auth/forgot-password` `{ email }`** - always the same 200 response, whether or not the email belongs to an account (never reveals who has one):
  `{ message: "If an account exists for that email, we've sent a password reset link." }`
  - If the email matches a user: generate 32 random bytes (`crypto.randomBytes`), hex-encode as the token, store only its SHA-256 hash (`resetPasswordTokenHash`) with `resetPasswordExpires` = now + 1 hour, and email a link `${APP_URL}/reset-password?token=<token>&email=<email>` via `emailService`.
  - Rate limited the same as register/login (per IP), since it is another way an anonymous visitor can act on an account.
- **`POST /api/auth/reset-password` `{ email, token, password }`**:
  - Looks up the user by email, hashes the given token the same way, and compares. Any mismatch, missing token, or an expired `resetPasswordExpires` all give the identical 400 "That reset link is invalid or has expired" - never a more specific reason.
  - On success: hash the new password, set `passwordChangedAt`, and clear `resetPasswordTokenHash` / `resetPasswordExpires` so the link cannot be used twice.
  - Does **not** log the user in - the client sends them back to `/login`.

### Google sign-in

OAuth 2.0 authorization-code flow with plain `fetch` (`googleAuthService.js`), no SDK:

- **`GET /api/auth/google`** (register/login rate limit): if not configured → redirect `/login?error=google_unavailable`. Otherwise a random 16-byte hex `state` in an httpOnly cookie `oauth_state` (path `/api/auth/google`, 10 minutes), then redirect to Google with scope `openid email profile`, `prompt=select_account`, redirect URI `${APP_URL}/api/auth/google/callback`.
- **`GET /api/auth/google/callback?code&state&error`**: clears the state cookie; refuses (→ `/login?error=google_failed`) a missing code, an `error`, or a `state` that does not equal the cookie (login CSRF). Swaps the code for a token server-to-server, fetches the profile, and refuses an email Google has not verified.
- **Which account:** by `googleId`; else link the account with the same email (set `googleId`); else create one (only if `registrationOpen`, otherwise `registration_closed`; the allowed-email-domains rule does NOT apply) with `authProvider: 'google'`, no password, and a username from the email's local part (random 4 digits appended if taken). Suspended → `suspended`.
- On success: the normal session cookie (as with Remember me ticked), redirect `/`. The browser never sees Google's tokens or the client secret.
- Password login on an account with no password → the usual 401 "Invalid credentials". Change password on one → 400 telling them to use "Forgot password".

### Change password (while logged in)

- **`PATCH /api/auth/password` `{ currentPassword, newPassword }`**, `requireAuth`:
  - Verifies `currentPassword` with bcrypt. Wrong password → **400** (not 401) "Current password is incorrect" - the request already passed `requireAuth`, so this is a rejected value, not an authentication failure; a 401 here would trigger the client's "session expired, log out" handling instead of showing the message inline.
  - `newPassword` must differ from `currentPassword`.
  - On success: hash the new password, set `passwordChangedAt`, and reissue the session cookie for the current response - so the tab that changed it stays logged in while every other device is signed out on its next request (via `userFromToken`'s `ts` check).
  - Rate limited per user (like profile edits), not per IP - it is an authenticated action, and an IP limit would unfairly cap several logged-in users on one network.

---

## Friend system rules (MOST IMPORTANT)

### Search

`GET /api/users/search?username=`

- **Exact match on the normalised username only.** No partial, regex or prefix search. Partial search would let anyone list all users, which defeats the purpose of the feature.
- **Response:** `{ user: PublicUser, relationship }`, or 404 `{ message: "No user found" }`.
- **`relationship`** is one of `'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'`. A declined friendship shows as `'none'` to both sides.
- If either user has blocked the other → the same 404 "No user found" (see Blocking).

### Send request

`POST /api/friends/requests { username }`. Checks run in this order:

1. The target doesn't exist, or either of us has blocked the other → 404 "No user found".
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

### Blocking

- **`POST /api/users/:id/block`** (profile rate limit): 400 for myself, 404 for an unknown user; upserts the Block (blocking twice is harmless, 204). Deletes any Friendship between us - accepted → `friend:removed` to both; pending → `friend:request:cancelled` to both. The Conversation and messages are kept (read-only, like an unfriend).
- **`DELETE /api/users/:id/block`** → 204. **`GET /api/users/me/blocked`** → `{ users: [PublicUser] }`, my blocks only, newest first.
- Works in BOTH directions and silently: search and send-request give the same 404 as a username that does not exist, so a blocked person cannot tell.

### Lists

- **`GET /api/friends`** returns `{ friends: [{ friend: PublicUser, conversationId, lastMessage, online, lastSeen, muted }] }`, sorted by the most recent `lastMessage.createdAt` (friends with no messages go last, newest friendship first). `muted` is whether *I* muted the chat. `lastMessage` is null for me if that message is deleted/cleared for me.
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

- **Allowed types (by magic bytes):** images JPEG, PNG, GIF, WebP; videos MP4, WebM, MOV; audio (voice notes) WebM/Opus, Ogg Opus/Vorbis, MP4/AAC and .m4a. WebM and MP4 are ALSO video containers, so a file is `audio` only if its header lists a sound track and no picture track (WebM codec IDs `A_OPUS`/`A_VORBIS` vs `V_*`; MP4 `hdlr` handler types `soun` vs `vide`) - otherwise it stays `video`. Ogg Theora (video) is refused; documents PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ZIP (ZIP and OLE files are labelled by extension), TXT (must be valid UTF-8 with no NUL bytes). **Never SVG or HTML** (they can run scripts).
- **Size limits:** images, documents and voice notes 10 MB, videos 25 MB. Too large → 413 "File is too large". Wrong type → 400 "This file type is not supported".
- **Download:** `GET /api/attachments/:id` → requireAuth → the requester must be a participant (404 otherwise, never 403); an unsent upload is visible only to its uploader. Supports HTTP `Range` (206 / 416) for video seeking. `Content-Type` is always the detected type, set after `res.attachment()`. Images, videos and voice notes are served `inline`; documents always `Content-Disposition: attachment`. `Cache-Control: private, max-age=86400`.
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

## Message actions

**Reply.** `message:send` accepts an optional `replyToId`. The server looks it
up **scoped to the same conversation** and stores a snapshot (`replyTo` on
the model) at that instant - not a live reference - so if the original is
later deleted, the quoted preview still shows what it said. If `replyToId`
does not resolve to a real message in this conversation (deleted meanwhile,
or simply invalid), the message is still sent, just without a `replyTo` -
this never fails the send.

**Delete.** `message:delete { conversationId, messageId, mode: 'me' | 'everyone' }`
(client → server, with ack):
- **`'me'`:** adds my id to `deletedFor`. Hidden on my devices only - never
  announced to the other participant, never touches the shared sidebar
  preview. History (`GET .../messages`) excludes anything in my own
  `deletedFor`, entirely, not just flagged.
- **`'everyone'`:** only the original sender may do this (403 otherwise), and
  only within `deleteForEveryoneWindowMinutes` of sending (default 60 -
  admin-editable, see Admin panel; 400 "This message is too old to delete
  for everyone" after that - not in the original spec, added because the
  team asked for a time limit). Sets `deletedForEveryone`, a soft delete: the
  row stays, but `messageView` always returns it as an empty placeholder
  (never the real text/attachment) once this is true.
  - If the deleted message WAS the conversation's `lastMessage`, recompute it
    from whatever is now the newest non-deleted message (or `null`), and
    include the new `lastMessage` in the broadcast event so connected clients
    can update their sidebar live, instead of showing stale, supposedly-deleted
    text until their next refetch.
- **Emit `message:deleted { conversationId, messageId, mode, lastMessage? }`**:
  `'everyone'` goes to both participants' rooms; `'me'` goes only to my own
  room (so my other tabs hide it too). `lastMessage` is only present when it
  actually changed - its absence means "nothing to update there", which is
  different from "cleared to null". The ack echoes the same event shape back
  to the tab that asked, since `socket.to(room)` never reaches the emitting
  socket itself (same as `message:send`'s own tab getting the ack, not the
  broadcast).

**Forward.** `message:forward { messageId, toConversationIds: [...] }` (up to
20 at once) copies a message's text and attachment into one or more OTHER
conversations, as a brand new message (`forwarded: true`, its own id and
`clientId`). The source message must not be deleted (for everyone, or for me
specifically). Each target is checked independently (`assertParticipant` +
`assertFriends`) - one bad target does not block the rest. The ack is
`{ ok: true, results: [{ conversationId, ok, message? , error? }] }`, one entry
per target. An attachment is never re-uploaded: a new `Attachment` document is
created pointing at the same GridFS `fileId`, with `message` already set (so
the 1-hour unsent-upload cleanup can never touch it).

**Copy** needs no server support at all - it is `navigator.clipboard.writeText`
on the client, given the message already has its text in hand.

---

## Read receipts

Three states, WhatsApp-style: a single grey tick (saved on the server), a
double **grey** tick (delivered - it reached the other person's app, because
they were online), and a double **blue** tick (they opened that chat while
it was actually on screen). The middle "delivered" state was originally left
out on purpose; it was added at the team's request in Phase 16a.

- **Delivered** is a second forward-only pointer per participant,
  `Conversation.lastDelivered` (same shape as `lastRead`), moved only by the
  SERVER - there is no client event for it:
  - when a message is sent (or forwarded) and the recipient `isOnline` right
    then, straight after the ack;
  - when a user connects (every tab, every reconnect), for the latest message
    from the other person in each of their conversations
    (`messageService.catchUpDelivered`).
  `markDelivered` is ONE atomic update whose filter is the "only moves
  forward" rule, so racing tabs can never move it back. Each time it actually
  moves, `message:delivered { conversationId, upToMessageId }` goes to the
  SENDER's room via `emitToUser` - every tab, including the sending one.
- The client draws a message as delivered if its id is \<= the other
  person's delivered OR read pointer (read implies delivered).
- A chat open in a **hidden or minimised tab** is NOT read: the client only
  emits `conversation:read` while `document.hidden` is false, and again on
  `visibilitychange` when the tab is shown - so it stays grey until seen.

- Tracked **per conversation**, not per message: `Conversation.lastRead` maps
  a user id to how far they have read (`upTo`, a Message id). A message is
  "read" on screen if its id is \<= the OTHER participant's `upTo` - same-length
  hex ids compare correctly as plain strings, so no per-message flag is ever
  written.
- **`conversation:read` (client → server, no ack required)**
  `{ conversationId, upToMessageId }`. Order: rate limit (20 per 5 seconds per
  socket) → validate → `assertParticipant` → only if `upToMessageId` is
  **further** than the caller's current pointer, update it and tell the other
  participant. An older or equal pointer is silently ignored - a pointer only
  ever moves forward.
- **`message:read` (server → client)** `{ conversationId, upToMessageId }` -
  sent to the OTHER participant only, so a client never gets its own read
  events echoed back.
- **`GET /api/conversations/:id/messages`** additionally returns
  `theirReadUpTo` and `theirDeliveredUpTo` (each a Message id, or null): the
  other participant's current pointers, so the client can render the right
  ticks immediately on load, without waiting for a live event.

## Typing indicator

- **`typing` (client → server, no ack)** `{ conversationId, isTyping }`.
  Rate limit (30 per 5 seconds per socket) → validate → `assertParticipant`
  → `assertFriends` → relayed as `typing { conversationId, userId, isTyping }`
  to the OTHER participant only. Never stored.
- The client sends `isTyping: true` on the first keystroke and then at most
  once every 3 seconds while typing continues; `false` after 3 seconds idle,
  on send, when the text is emptied, or when leaving the chat.
- The receiver shows "typing…" in the chat header and that friend's Chats
  row, clearing it on `false`, when their message arrives, or after 6 seconds
  with no update (their connection may simply have dropped).

## Notifications

- Browser notifications (Notification API, shown through a tiny service
  worker `client/public/sw.js` so they also work on Android Chrome) for a
  message from someone else, unless that exact chat is open in a VISIBLE
  tab. Title: their display name; body: the text or attachment label; icon:
  their picture. Tag per conversation, so a burst replaces rather than
  stacks. Clicking one focuses PingMe and opens that chat.
- While PingMe is open in some tab (even minimised), the open app shows them
  from socket events. While it is open NOWHERE, the server sends a **Web
  Push** instead (see "Installable app and push notifications" below) - so
  a person never gets both.
- Permission is only requested from a click (a one-line "Enable" offer in the
  sidebar, shown while the browser has not been asked yet, dismissible). A
  per-device on/off preference (`localStorage`) is kept separately, because a
  browser's "Allow" can only be revoked from the browser's own settings.
- The tab title shows the total unread count: `(3) PingMe`.
- **The client emits `conversation:read`:**
  - the moment a chat is opened, for the latest loaded message;
  - immediately when a new message arrives while that chat is already the
    open one;
  - after a reconnect, once the refetched history is in, for whatever is now
    the latest message (catches up on anything that arrived while offline).
- Ticks are shown only on **my own** sent messages - never on messages I
  received.

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

## Admin panel

An account with `isAdmin: true` gets full, database-backed control over the
knobs listed in the `Setting` model, plus basic user management and stats -
built specifically so the team never has to change code or redeploy just to
flip something on or off, close registration for a while, or deal with an
account. There is no partial/read-only tier: every admin route needs a real
`isAdmin` account, checked by `requireAdmin` (403 "Admins only") which always
runs immediately after `requireAuth`.

**Bootstrapping the first admin:** `npm run make-admin -- <username>` sets
`isAdmin` directly in the database. This has to be a script, not a panel
action, because there is no panel to grant it from until at least one admin
already exists. Promoting a SECOND admin later is also done this way (not a
panel button) - rare enough that a script is fine, and it keeps the panel's
own user-management screen focused on suspend/delete, not privilege
escalation.

### Settings

- **`GET /api/admin/settings`** returns every field of the `Setting` document.
- **`PATCH /api/admin/settings`** validates the body with zod (domains must
  look like `word.word`; announcement text max 200; the delete window 1-10080
  minutes) and applies only the fields actually sent - anything omitted is
  left unchanged. After saving, it calls `emitToAll('settings:updated', ...)`
  with the PUBLIC subset (see below), so every connected client - including
  ones on the login/register page, if they happen to have a socket - can
  react live, without a reload.
- **`GET /api/settings/public`** is unauthenticated on purpose: the login and
  register pages, and the announcement banner, all need it before anyone is
  logged in. It returns only `{ registrationOpen, allowedEmailDomains, announcement }` -
  never the feature toggles that have no business being public
  (`attachmentsEnabled`, `forwardingEnabled`, `deleteForEveryoneWindowMinutes`).

### User management

- **`GET /api/admin/users?search=&page=&limit=`** - unlike the exact-only
  username search everyone else uses (`friendService.searchByUsername`),
  this is a deliberate, partial, case-insensitive match on username OR
  email. That asymmetry is intentional: exact-only search exists specifically
  to stop an ORDINARY user from browsing the directory; an admin's own list
  is supposed to let them find someone, and it is only ever reachable by an
  account that already has `isAdmin`.
- **`PATCH /api/admin/users/:userId/suspend`** sets `suspended: true` and
  immediately force-disconnects that user's active sockets
  (`emitter.disconnectUser`, `io.in(room).disconnectSockets()`) - otherwise
  they could keep chatting until whatever session they were holding expired
  on its own. Their session then also fails on its very next REST call or
  socket handshake (`userFromToken` rejects a suspended user - see
  Authentication rules), so suspension is effectively immediate on both
  channels, not just "at next login".
- **`PATCH /api/admin/users/:userId/unsuspend`** clears the flag; login and
  existing behaviour resume normally.
- **`DELETE /api/admin/users/:userId`** is a genuine, hard, irreversible
  delete of the account. It also deletes every `Friendship` row involving
  them, so they vanish LIVE from every remaining friend's Chats/Requests
  list - reusing the exact same events an ordinary unfriend or a cancelled
  request already produce (`friend:removed` for an accepted friendship,
  `friend:request:cancelled` for a pending one THEY had sent), rather than
  inventing a new event. Their past MESSAGES and CONVERSATIONS are
  deliberately left alone - the surviving participant's history is not
  destroyed, the same principle `friendService.unfriend` already uses for an
  ordinary unfriend.
- An admin can never suspend or delete their OWN account (400) - a
  self-lockout guard, since there is no "un-suspend yourself" path once your
  own session stops working.

### Stats

**`GET /api/admin/stats`** returns `{ totalUsers, totalMessages, onlineNow, aiAnswersToday }`
(`aiAnswersToday`: PingMe AI answers in the last 24 hours, failed ones not counted).
`onlineNow` is computed by checking every user against the existing
`presenceService.isOnline` (there is no separate "list everyone online" call)
- fine at this app's scale, and avoids a second, parallel tracking structure
just for one number on one screen.

### Rate limiting

Admin mutation routes (`PATCH`/`DELETE`) share one limiter, 200 per hour per
user - generous, since `requireAdmin` is the real gate and there is normally
only one admin account using it; this just stops a mis-click loop or a
runaway script.

### Client

- `/admin` (`AdminPage.jsx`) is a standalone page, not part of the chat
  layout - not wrapped in `SocketProvider` (the admin screens do not need
  live updates; refreshing is enough). Reached only via a small shield icon
  next to Log out in the sidebar, shown only when `user.isAdmin`; the route
  itself redirects anyone else straight back to `/`.
- Four tabs: **Overview** (the four stats), **Users** (search, suspend/
  unsuspend, delete - delete asks for confirmation with a native
  `window.confirm`, the same pattern the chat header's "Remove friend" already
  uses), **Updates** (post to / delete from the "PingMe" updates channel -
  see "Updates channel"), **Settings** (every toggle above, the PingMe AI
  switch / daily limit / picture creation - with a warning when the server
  has no `GEMINI_API_KEY` - plus the announcement banner).
- **`AnnouncementBanner.jsx`** is rendered in TWO places - inside `AuthLayout`
  (login/register/forgot/reset pages) and inside `ChatPage` - because
  `useSocket()` only returns a real socket inside the logged-in part of the
  app (`SocketProvider` only wraps `ChatPage`). Both copies fetch
  `GET /api/settings/public` once on mount; only the logged-in copy also
  listens for the live `settings:updated` broadcast.
- **`RegisterPage`** fetches the public settings once, purely for a better
  experience (shows "Registration is currently closed" instead of a normal
  form, and hints which email domains are accepted) - the server enforces
  both regardless, so a stale or failed fetch here can never let through
  something the server would otherwise refuse.

---

## Updates channel ("PingMe", like WhatsApp's own official chat)

A read-only chat from PingMe itself, pinned at the very top of every user's
Chats list, where admins announce new features and news.

- **Why its own `Update` collection, not a fake "PingMe" user:** a fake
  account would need exceptions in search, friend requests and
  `assertFriends`. A separate collection leaves every friend rule untouched.
- **Posting** (`POST /api/admin/updates`): `requireAuth` + `requireAdmin` run
  BEFORE multer (a non-admin can never make the server receive a file), then
  `singleFile('image', 10 MB, { optional: true })`, then zod on `text` (max
  1000). Text and/or one photo, never neither (400 "Write something or add a
  photo"); the photo's type from its bytes (400 for anything but
  JPEG/PNG/WebP/GIF - never SVG). Admin mutation rate limit. Then
  `emitToAll('update:new', { update })`.
- **Deleting** (`DELETE /api/admin/updates/:id`): removes the post and its
  GridFS photo, then `emitToAll('update:deleted', { id })`.
- **Reading** is for any logged-in user: summary, keyset-paged list (the same
  rules as chat history), photo (inline, cached a year - a post's photo never
  changes).
- **Unread** = posts with an id after my `User.updatesReadUpTo`; a new
  account starts at null, so every earlier post counts as unread (they
  discover what PingMe can do). `POST /api/updates/read` is ONE atomic update
  whose filter is the "only moves forward" rule; when it actually moves,
  `updates:read` goes to my own room so my other tabs clear the badge.
- **Client:** `components/updates/UpdatesRow.jsx` is the pinned row (avatar,
  "PingMe" + verified tick, latest preview, unread badge) - always first in
  Chats, even with no friends. Opening it sets `activeConversationId` to the
  sentinel `UPDATES_CHAT_ID` (`'pingme-updates'`, never a real 24-hex id),
  and `ChatPage` renders `UpdatesChannel.jsx` instead of `ChatWindow`: posts
  as incoming bubbles with date separators, photos open full size, older
  posts load on scrolling up, and in place of the composer a bar saying
  "Only PingMe can send messages here". It marks the channel read only
  while the tab is visible (same rule as a chat). Anything that would treat
  the sentinel as a conversation (e.g. the reconnect refetch) must skip it.
- **Live:** `update:new` adds the post, bumps the badge and shows a browser
  notification (title "PingMe", tag per channel) unless the channel is open
  in a visible tab; the tab-title count includes it. `update:deleted`
  removes it and refetches the summary. After a reconnect, the summary (and
  the loaded page) are refetched.
- The admin's **announcement banner** stays: it is for urgent, temporary
  notices; the channel is the permanent news feed.

---

## PingMe AI (like Meta AI in WhatsApp)

Each user's own private chat with an AI assistant, **Google Gemini**,
pinned at the top of Chats (above the "PingMe" updates row) while it is
available: the server has a `GEMINI_API_KEY` AND an admin has not switched
`aiEnabled` off.

- **Not a fake user, not a Conversation** - its own `AiMessage` collection,
  for the same reason as the updates channel: the friend rules stay
  untouched. The client opens it with the sentinel `AI_CHAT_ID`
  (`'pingme-ai'`); anything that treats the open id as a conversation (the
  reconnect refetch) must skip it.
- **One file talks to Google:** `services/geminiClient.js` (the SDK, the
  models, error mapping). `aiService.js` only passes plain objects, and the
  tests replace `geminiClient.js` with a fake - no test ever calls Google.
  The e2e server wraps `fetch` with a fake Gemini (`e2e/fakeGemini.js`).
- **Asking** (`POST /api/ai/messages`, multipart `text`, `clientId`,
  `mode`, optional `file` + voice fields): `aiLimiter` → `checkCanAsk`
  (available, not already answering, under the daily limit) **before**
  multer reads any file → zod → `aiService.ask`, which takes the user's one
  "answer in progress" slot synchronously (a second request → 409 "still
  answering"), saves the question AND an empty answer (`status:
  'streaming'`), emits `ai:new`, and returns **202** `{ question, answer }`.
  The answer is then written in the background and streamed over the
  socket (REST because a question may carry a 10 MB file, the socket because
  the answer *happens* over time).
- **Streaming:** `ai:delta { id, text, reasoning }` carries the WHOLE answer
  so far (not a piece), so a missed event is harmless; `ai:done { message }`
  is the final saved copy. All to the user's own room (`emitToUser`) - every
  tab, nobody else. A server restart mid-answer leaves it `streaming`;
  `recoverInterrupted()` at startup marks those `error` (with Try again).
- **Memory:** Gemini keeps nothing between requests - each request carries
  the last 20 messages (errors left out, starting with a question). Files go
  in as their real bytes (`inlineData`) only for the newest 3 questions that
  have one, within 12 MB; older ones become a one-line note.
- **Reasoning:** `thinkingConfig { thinkingLevel: LOW | HIGH, includeThoughts:
  true }` - HIGH for "Think deeper". Thought parts (`part.thought`) are saved
  as `reasoning`, shown behind "Show reasoning" (and as "Thinking: <heading>"
  while it works). Simple questions may have none.
- **Files PingMe AI reads** (by magic bytes, max 10 MB): JPEG, PNG, WebP,
  PDF, TXT, voice notes (WebM/Ogg/MP4 audio), MP4/WebM/MOV video. Not GIF or
  Office files (Gemini can't). Downloads (`GET /api/ai/files/:id`) are for
  the owner only (404 otherwise); photos/audio/video inline, documents as
  downloads.
- **"Imagine"** (create or change a picture) uses `GEMINI_IMAGE_MODEL`, which
  is NOT on Gemini's free tier - so `aiImageGenerationEnabled` is false by
  default and the chip is hidden. The returned picture is checked by its
  bytes before it is stored and served. A free key gives "isn't available on
  this server's Gemini plan".
- **Forward to PingMe AI:** the Forward dialog lists PingMe AI first.
  `POST /api/ai/forward { messageId, clientId }` - `assertParticipant` on the
  source chat (404 otherwise), not deleted, the admin forwarding switch
  applies; the file is shared, not copied.
- **Stop** (`POST /api/ai/stop`) aborts the request (AbortController) and keeps
  what had arrived (`stopped`). **Try again** (`POST /api/ai/retry`) re-answers
  the latest answer if it is `error`. **Clear chat** (`DELETE
  /api/ai/messages`) deletes my AI messages and their own files, emits
  `ai:cleared`; an admin deleting an account does the same.
- **Busy Gemini (common on the free tier):** a 429/5xx or a dropped stream is
  tried on `GEMINI_FALLBACK_MODEL`, then - after 2 s - the main model once
  more; each failure is logged (model + status, never the key). Then the
  answer is `error` "PingMe AI is busy right now - please try again in a
  minute." Safety-blocked → "Sorry, PingMe AI can't help with that."
- **Limits:** one answer at a time per user; `aiDailyLimit` answers per
  rolling 24 h (429, failed answers don't count); `aiLimiter` 30 requests
  per 10 minutes per user; answers capped at 8192 output tokens (a cut-off
  answer gets a note).
- **Privacy:** the chat shows that it is powered by Google Gemini, that what
  is sent goes to Google (which may use it to improve its products on the
  free plan) and that it can make mistakes. PingMe AI sees nothing from
  other chats unless the user forwards it. No web search (paid-only).
- **Answers are Markdown**, shown by `components/ai/Markdown.jsx` - our own
  small renderer that builds React elements only (no HTML string, no
  `dangerouslySetInnerHTML`), links only for `http(s)`.
- **Client:** the `ai` slice in the store (`available`, `imageGeneration`,
  `dailyLimit`, `usedToday`, `latest`, `items`, `hasMore`, `status`);
  questions are optimistic (pending by `clientId`, Retry/Remove on failure);
  the same message arriving twice keeps the newest `updatedAt`. Composer:
  📎, 🎤 (voice question), "Think deeper" and "Imagine" chips, Send → Stop
  while answering, "N messages left today" near the limit. A finished
  answer notifies ("PingMe AI") unless the chat is open in a visible tab.

---

## Installable app and push notifications (Phase 22)

PingMe is a **Progressive Web App**: one codebase that is also installable
on Android, iPhone, Windows and Mac - no app store, no second app.

- **`public/manifest.webmanifest`:** name, `start_url: '/'`, `display:
  standalone` (no browser bar), `theme_color` `#00a884`, white splash, and
  PNG icons in `public/icons/`: 192 and 512 (`any`, rounded, transparent
  corners), 512 `maskable` (edge to edge, bubble inside the 80% safe zone),
  `apple-touch-icon.png` 180 (opaque - iOS fills transparency black) and
  `badge-96.png` (white on transparent, Android's status bar). `index.html`
  links the manifest and the iPhone icon and sets the `apple-mobile-web-app-*`
  tags. `theme-init.js` sets the dark top-bar colour before React loads.
- **Installing** (`utils/install.js`, loaded by `main.jsx` so the event is
  never missed): Chrome/Edge fire `beforeinstallprompt` once - we
  `preventDefault()` it, keep it, and our **Install** buttons call
  `prompt()`. iPhone/iPad have no such event, so they get
  `InstallAppDialog` (Share → Add to Home Screen → Add). States: `installed`
  (standalone, or `appinstalled` fired), `prompt`, `ios`, `manual`. Offered in
  three places: a dismissible one-line offer under the notifications offer
  in the sidebar (`InstallPrompt`, dismissal remembered per device), Settings
  → **App**, and an "Install the app" link in the home page hero (+ FAQ).
- **Service worker** (`public/sw.js`): shows notifications (the open app's
  and push ones), handles taps, and keeps ONE thing cached - `offline.html`
  and the icon it shows - served only when a page load fails for lack of a
  connection. It never touches the API, sockets, files or the app's code,
  so nothing can go stale. Bump `CACHE` when `offline.html` changes.
- **Web Push** (`services/pushService.js`, `utils/push.js`): with notifications
  allowed and on, the browser makes a push subscription with our public
  VAPID key (`GET /api/push/key`) and the client saves it
  (`POST /api/push/subscriptions`) - on every app start, after enabling
  notifications, and after a password change (idempotent). The server pushes
  only to people who have PingMe open **nowhere** (`isOnline`), for: a new or
  forwarded message (not for a muted chat), a friend request, an accepted
  request, a finished PingMe AI answer and a new PingMe update post. Payload
  `{ title, body, icon?, tag, open }`; `open` is what a tap shows - a
  conversation id, `'requests'`, `'pingme-ai'` or `'pingme-updates'`. A tap
  focuses an open PingMe (postMessage) or opens `/?open=<target>`, which
  `LoggedInLayout` hands to the store's `openTarget()` (only those shapes are
  accepted) and then removes from the address. Every send is
  fire-and-forget (never delays or breaks a message); 404/410 deletes the
  subscription; other failures are logged with the push service's host.
- **Who gets pushes:** only the device's current account. Logout first
  deletes this device's subscription (`removePushSubscription`, max 3 s
  wait); a password change/reset, suspension or account delete deletes all
  of that account's subscriptions (the device still logged in re-subscribes).
  Switching notifications off in Settings unsubscribes the device.
- **iPhone:** push exists only for an installed app (iOS 16.4+), so Settings
  points iPhone users to App → install.

---

## Socket events contract

| Event | Direction | Payload |
|---|---|---|
| `message:send` | client → server, with ack | `{ conversationId, text?, clientId, attachmentId?, replyToId? }` → ack `{ ok: true, message }` or `{ ok: false, error }` |
| `message:new` | server → client | Message payload |
| `message:delete` | client → server, with ack | `{ conversationId, messageId, mode: 'me' \| 'everyone' }` → ack `{ ok: true, conversationId, messageId, mode, lastMessage? }` or `{ ok: false, error }` |
| `message:deleted` | server → client | `{ conversationId, messageId, mode, lastMessage? }` |
| `message:forward` | client → server, with ack | `{ messageId, toConversationIds: [...] }` → ack `{ ok: true, results: [{ conversationId, ok, message?, error? }] }` or `{ ok: false, error }` |
| `presence:snapshot` | server → client | `{ online: [userId] }` |
| `presence:update` | server → client | `{ userId, online, lastSeen? }` |
| `friend:request:new` | server → client | `{ request: { id, user, createdAt } }` |
| `friend:request:accepted` | server → client | `{ friend: FriendListItem }` |
| `friend:request:cancelled` | server → client | `{ requestId }` |
| `friend:removed` | server → client | `{ userId }` |
| `user:updated` | server → client | `{ user }` - PublicUser to contacts, SelfUser to the user's own tabs |
| `conversation:read` | client → server, no ack required | `{ conversationId, upToMessageId }` |
| `message:read` | server → client | `{ conversationId, upToMessageId }` |
| `message:delivered` | server → client (the sender's room) | `{ conversationId, upToMessageId }` |
| `typing` | client → server, no ack | `{ conversationId, isTyping }` |
| `typing` | server → client (the other participant) | `{ conversationId, userId, isTyping }` |
| `conversation:cleared` | server → client (my own tabs) | `{ conversationId }` |
| `conversation:muted` | server → client (my own tabs) | `{ conversationId, muted }` |
| `settings:updated` | server → client (everyone, not just one room) | `{ registrationOpen, allowedEmailDomains, announcement }` - the PUBLIC subset only |
| `update:new` | server → client (everyone) | `{ update }` - a new post in the "PingMe" updates channel |
| `update:deleted` | server → client (everyone) | `{ id }` |
| `updates:read` | server → client (my own tabs) | `{ upToId }` - I read the channel on another tab |
| `ai:new` | server → client (my own tabs) | `{ messages: [AiMessage] }` - a question and its empty answer, or an answer being retried |
| `ai:delta` | server → client (my own tabs) | `{ id, text, reasoning }` - the WHOLE answer so far |
| `ai:done` | server → client (my own tabs) | `{ message }` - the final answer (`done`, `stopped` or `error`) |
| `ai:cleared` | server → client (my own tabs) | `{}` - I cleared my PingMe AI chat |

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
| GET | `/api/conversations/:id/messages` | yes | `{ messages, hasMore, theirReadUpTo }` |
| PATCH | `/api/users/me` | yes | `{ displayName?, bio?, username?, theme? }` → `{ user }` (SelfUser) |
| GET | `/api/users/me/blocked` | yes | `{ users }` (PublicUser) |
| POST | `/api/users/:id/block` | yes | 204 |
| DELETE | `/api/users/:id/block` | yes | 204 |
| GET | `/api/conversations/:id/attachments` | yes | `{ items: [{ messageId, senderId, createdAt, attachment }] }`, newest first (max 200), excluding deleted-for-everyone and deleted-for-me |
| POST | `/api/conversations/:id/clear` | yes | 204 - every message hidden for ME only (added to `deletedFor`) |
| PATCH | `/api/conversations/:id/mute` | yes | `{ muted: boolean }` → `{ muted }` |
| GET | `/api/auth/google` | no | Redirect to Google (see Google sign-in) |
| GET | `/api/auth/google/callback` | no | Redirect to `/` or `/login?error=...` |
| PUT | `/api/users/me/avatar` | yes | multipart `avatar` → `{ user }` |
| DELETE | `/api/users/me/avatar` | yes | `{ user }` |
| GET | `/api/users/:id/avatar` | yes | The picture (image bytes) |
| POST | `/api/conversations/:id/attachments` | yes | multipart `file` → 201 `{ attachment }` |
| GET | `/api/attachments/:id` | yes | The file (bytes, Range supported) |
| POST | `/api/auth/forgot-password` | no | `{ email }` → the same 200 message either way |
| POST | `/api/auth/reset-password` | no | `{ email, token, password }` → 200 message |
| PATCH | `/api/auth/password` | yes | `{ currentPassword, newPassword }` → 200 message, cookie reissued |
| GET | `/api/settings/public` | no | `{ settings }` - registrationOpen, allowedEmailDomains, announcement, googleSignIn |
| GET | `/api/admin/settings` | admin | `{ settings }` (every field) |
| PATCH | `/api/admin/settings` | admin | Any subset of `Setting`'s fields → `{ settings }` |
| GET | `/api/admin/users?search=&page=&limit=` | admin | `{ users, total, page, limit }` (AdminUser shape) |
| PATCH | `/api/admin/users/:userId/suspend` | admin | `{ user }` |
| PATCH | `/api/admin/users/:userId/unsuspend` | admin | `{ user }` |
| DELETE | `/api/admin/users/:userId` | admin | 204 - hard delete, see Admin panel |
| GET | `/api/admin/stats` | admin | `{ totalUsers, totalMessages, onlineNow, aiAnswersToday }` |
| GET | `/api/updates/summary` | yes | `{ latest, unreadCount }` - for the pinned "PingMe" row |
| GET | `/api/updates?before=&limit=20` | yes | `{ updates, hasMore }`, oldest → newest, keyset pagination (max 50) |
| POST | `/api/updates/read` | yes | `{ upToId }` → 204 (404 if not a real post); the pointer only moves forward |
| GET | `/api/updates/:id/image` | yes | The post's photo (cached for a year) |
| POST | `/api/admin/updates` | admin | multipart `text?` + `image?` (or JSON `{ text }`) → 201 `{ update }` |
| DELETE | `/api/admin/updates/:id` | admin | 204 - deletes the post and its photo for everyone |
| GET | `/api/ai/summary` | yes | `{ available, imageGeneration, dailyLimit, usedToday, latest }` |
| GET | `/api/ai/messages?before=&limit=30` | yes | `{ messages, hasMore }` - my AI chat, oldest → newest (max 50) |
| POST | `/api/ai/messages` | yes | multipart `text`, `clientId`, `mode`, `file?`, `durationMs?`, `waveform?` → 202 `{ question, answer }` |
| POST | `/api/ai/forward` | yes | `{ messageId, clientId }` → 202 `{ question, answer }` |
| POST | `/api/ai/retry` | yes | 202 `{ answer }` - re-answer my latest failed answer |
| POST | `/api/ai/stop` | yes | 204 - stop the answer being written |
| DELETE | `/api/ai/messages` | yes | 204 - clear my AI chat (and its own files) |
| GET | `/api/ai/files/:id` | yes | The file of one of MY AI messages (Range supported) |
| GET | `/api/push/key` | yes | `{ publicKey }` - the VAPID public key, or null when push is not set up |
| POST | `/api/push/subscriptions` | yes | `{ endpoint, keys: { p256dh, auth } }` → 204 - this device gets pushes (endpoint must be a known push service) |
| DELETE | `/api/push/subscriptions` | yes | `{ endpoint }` → 204 - this device stops getting pushes (only my own) |

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
  - Forgot/reset password: same budget as register/login (10 per 15 minutes per IP).
  - Change password: 20 per hour per user (same as profile changes).
  - Block / unblock, clear chat and mute: the same profile budget (20 per hour per user).
  - Google sign-in start and callback: the register/login budget (per IP).
  - Socket messages: as described above.
  - `message:delete` / `message:forward`: share one limit, 20 per 5 seconds per socket (user-initiated clicks, not automatic events, so they get `message:send`'s own budget rather than a separate counter).
  - Admin mutation routes (settings, suspend/unsuspend, delete): 200 per hour per user - `requireAdmin` is the real gate, this just stops a runaway script.
  - PingMe AI questions, forwards and retries: 30 per 10 minutes per user (on top of one answer at a time and the admin's daily limit); clearing the AI chat uses the profile budget.
  - Push subscribe / unsubscribe: the profile budget (20 per hour per user).
- **Uploads:** type checked by magic bytes against an allowlist (no SVG/HTML); size limited while streaming; never written to the server's disk; every download permission-checked; documents never rendered inline; `nosniff` (helmet).
- `passwordHash` never appears in any response. Other users only ever receive the PublicUser shape.
- `isAdmin` and `suspended` never appear about anyone but yourself (SelfUser) or in the admin panel's own AdminUser list - never in PublicUser.
- Every `/api/admin/*` route requires BOTH `requireAuth` and `requireAdmin` (403 "Admins only" for a logged-in non-admin) - there is no read-only or partial admin tier.
- Suspending a user invalidates their session immediately on every channel: `userFromToken` rejects a suspended user's token (REST and socket handshake alike), and `disconnectUser` force-closes any ALREADY-open socket at the same moment.
- A password-reset token is never stored or logged in its raw form, only its SHA-256 hash - the same reasoning as `passwordHash`. Forgot-password never reveals whether an email has an account.
- No `dangerouslySetInnerHTML` anywhere. Render message text as plain text with `white-space: pre-wrap`. PingMe AI's Markdown answers go through `Markdown.jsx`, which only builds React elements (links only for `http(s)`).
- PingMe AI: `GEMINI_API_KEY` is never logged or sent to the browser; every AI route only reads/writes the logged-in user's own messages; a file Gemini created is checked by its bytes like any upload; the tests never call Google (`geminiClient.js` is faked in `npm test`, `fetch` in the e2e server).
- Web Push: a subscription endpoint must be `https:` on an allow-listed push service host (no SSRF to arbitrary addresses); payloads are encrypted for the device (the push service cannot read them); `VAPID_PRIVATE_KEY` is never logged or sent; a device stops getting pushes on logout, and every device on a password change/reset, suspension or delete; tests never post to a real push service (`web-push` is faked in `npm test`, push keys are blanked in the e2e server).
- Secrets only in environment variables. Never log passwords, tokens or cookies.
- In production: `trust proxy` is set and cookies are `secure`.
- `npm audit` has no high or critical issues.

---

## Client rules

### Routes and session

- Routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/` (the chat app when logged in; the public **home page** when logged out - see "Home page" below), `/settings` (protected) and `/admin` (only when `user.isAdmin` - a logged-in non-admin is sent to `/`). Logged out, `/settings` and `/admin` send you to `/login`. Unknown routes redirect to `/`.
- **Ending a session goes to `/login` explicitly** (`AuthContext`'s `clearSession`, used by Log out and by the 401 handler below): since `/` is the home page for logged-out visitors, a plain "clear the user" would otherwise land on the home page instead of the login form. A fresh visit (or reload) while logged out is just an ordinary visitor and gets the home page.
- **AuthContext:** calls `GET /api/auth/me` on load and shows a full-screen spinner until it resolves. There must be no flash of the login page for users who are already logged in.
- **axios instance:** `baseURL: '/api'`, `withCredentials: true`. On a 401 from any call except `/auth/me` and `/auth/login`, clear the user and go to `/login`. (`/auth/password`'s "wrong current password" is deliberately a 400, not a 401, so it is never mistaken for an expired session.)

### Sockets and state

- **SocketProvider:** creates exactly one socket per logged-in session, after login, with `io({ withCredentials: true })`. It disconnects on logout. It lives in `LoggedInLayout`, the parent route of BOTH `/` and `/settings`, together with `useSocketEvents`, the initial fetches, the banners and the toasts - so opening Settings never disconnects.
- **`useSocketEvents`:** all socket listeners are registered in this one hook, inside `useEffect`, with `socket.off` in the cleanup. React StrictMode runs effects twice in development, so without cleanup every message would appear twice.
- **zustand store** holds: `friends`, `requests`, `messagesByConversation`, `presence`, `activeConversationId` and `unreadCounts`.
- A reply-in-progress (which message, if any, the composer is currently replying to) is UI state local to `ChatWindow`, not in the zustand store - it never needs to be read anywhere else, and it must reset when the open conversation changes.

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

- **Header:** the friend's name (with a bell-off icon if muted), with "Online" or "Last seen …". Clicking the name or picture opens **Contact info**.
- **Contact info panel** (beside the chat on wide screens, over it on narrow ones): picture, name, @username, status, bio; photos/videos grid (click → full size) and documents list (click → download) from `GET /conversations/:id/attachments`; a Mute notifications switch; Clear chat, Remove friend and Block, each behind a `ConfirmDialog`.
- **Message list:**
  - My messages on the right, theirs on the left, with the time on each.
  - Date separators: Today, Yesterday, then dates.
- **Input:**
  - Enter sends; Shift+Enter adds a new line - unless "Enter to send" is off in Settings (per browser), when Enter is a new line and only the Send button sends.
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
- **Read receipts:** the timestamp and status icon sit INSIDE the bubble,
  bottom-right (not as a caption below it) - a clock while sending, a single
  grey tick once saved, two grey ticks once delivered, two blue ticks once the
  other person has opened the chat. Computed from `theirDeliveredUpTo` /
  `theirReadUpTo` (loaded with history) and the live `message:delivered` /
  `message:read` events, never from a per-message flag.
- **Typing:** "typing…" (green) replaces Online/Last seen in the chat header,
  and the last-message preview in that friend's Chats row.
- **Composer per chat:** `MessageInput` is keyed by conversation, so switching
  chats starts an empty composer (and ends any "typing" in the old chat).
- **Logout** (sidebar top bar) asks "Log out?" in a dialog first.
- **Message actions:** hovering (or tapping, on touch) a saved message shows a
  small actions button - Reply, Copy (only when there is text), Forward,
  Delete. Not shown on a pending (unsent) or already-deleted-for-everyone
  message.
  - **Reply** shows a quoted-preview bar above the composer (sender + a short
    snippet, or "📷 Photo" / "🎥 Video" / "📄 File" for an attachment with no
    caption) with a Cancel button; the same preview then renders inside the
    sent bubble.
  - **Delete** opens a small dialog: "Delete for me" is always offered;
    "Delete for everyone" is offered only when the message is mine AND still
    within a client-side hint window (hardcoded to 60 minutes - **known gap:**
    it does not read the admin-configured `deleteForEveryoneWindowMinutes`,
    so if an admin changes that setting, the button may hide itself too
    early or too late by comparison; the server enforces the REAL, current
    setting regardless, so this can only ever hide a button early, never let
    through a delete the server would refuse). A message deleted for
    everyone renders as an italic "This message was deleted" placeholder, in
    the same place in the
    timeline, so the conversation never visibly shifts.
  - **Forward** opens a dialog listing every friend with a checkbox
    (multi-select), and a Forward button.
  - **Copy** writes the message's text to the clipboard and shows a toast.

### Home page (`/` when logged out, `pages/LandingPage.jsx`)

- A static page - no API calls or state of its own (only the shared `AnnouncementBanner`): sticky header (logo, links to Features / How it works / Privacy / FAQ from `md` up, Log in, Sign up), hero ("Get started" → `/register`, "Log in" → `/login`) with `landing/ChatPreview.jsx`, three highlights, a features grid (led by one wide "PingMe AI" card), three "how it works" steps, privacy and security, an FAQ (native `<details>`), a final call to action and a footer (project credit, GitHub, "built with").
- **Only real features are advertised** - never calls, end-to-end encryption or anything else PingMe does not do (an e2e test checks for "video call" / "voice call" / "end-to-end").
- `ChatPreview` is a picture of the app built from the app's own classes and components (Avatar, TypingDots, bubble tails), not a screenshot, so it follows dark mode; it is `aria-hidden` with an `sr-only` description, and contains nothing focusable.
- Motion is CSS only, in `index.css`'s reduced-motion block: bubbles appear in turn (`landing-pop` with a per-bubble `--delay`), the preview's ticks turn blue (`landing-tick`), the phone floats, cards fade in on scroll (`reveal`, `animation-timeline: view()` inside `@supports` - browsers without it just show the cards), and header links scroll smoothly (`html:has(.landing-page)` only).
- The page root is `overflow-x-clip` (not `hidden`, which would break the sticky header) so decorations can never make a phone scroll sideways. Links that look like buttons use `buttonClass()` from `common/buttonClass.js`, the same classes `Button` uses.
- The login/register/forgot/reset pages' logo links back to `/`.

### Login, forgot password, reset password

- **Login page:** a "Remember me" checkbox (unticked by default) and a "Forgot password?" link under the password field. `?error=google_failed|google_unavailable|registration_closed|suspended` shows a fixed message for that code (never text from the URL).
- **"Continue with Google"** (a plain link to `/api/auth/google`) under the login and register forms, only when public settings say `googleSignIn: true`.
- **Register page:** a "Confirm password" field, checked in the browser only ("Passwords do not match"), never sent to the server.
- **Error screen:** a full-page "Something went wrong" + Try again, shown when (a) the very first `/auth/me` check cannot reach the server at all (a 401 still means "logged out" and shows the login page), or (b) a React error boundary catches a crash while rendering (Try again reloads the page).
- **Forgot password page:** one email field. Always shows the same "we've sent a link" message on submit, whether or not the account exists.
- **Reset password page:** reached from the emailed link (`?token=...&email=...`). A missing token or email shows "Invalid reset link" instead of a broken form. New password + confirm (checked client-side too). On success, redirects to `/login?reset=success`, which shows a green "Password reset" banner - not an automatic login.

### Profile

- The sidebar footer (my avatar and name) opens a **Your profile** dialog: photo (Add/Change/Remove - saved immediately, cropped to 256×256 in the browser), display name, username, bio (160 max, with a counter), email (read-only). Save sends only the changed fields.
- Changing the username asks for confirmation (30-day lock, old name becomes available). While locked, the field is disabled and says until when.
- Clicking a friend's picture or name in the chat header opens their Contact info panel. The Add Friend result card shows the bio.
- `user:updated` updates that person everywhere they appear (Chats, Requests, chat header), or my own profile if it is me.
- Dialogs use the native `<dialog>` element (`showModal`): focus trap, Escape and backdrop click close it.
- **Change password** is its own form inside the same dialog, below the profile fields, with its own Save button: current password, new password, confirm. On success, the current tab stays logged in and a message says other devices were signed out.

### Settings page (`/settings`, gear icon in the sidebar top bar)

- Profile summary + Edit profile (the same Your profile dialog); Account: email, sign-in method ("Password", "Google" or "Password or Google"), Change password.
- Privacy: blocked contacts with Unblock. Notifications: on/off switch (asks the browser for permission when needed; explains when blocked or unsupported; says whether they also arrive while PingMe is closed - off also unsubscribes push). App: install PingMe (Install button / iPhone steps / "installed"). Chats: Enter to send. Theme: Light / Dark / Same as device. Help & support: link to the GitHub issues page. Log out (the same "Log out?" dialog as the sidebar).
- Notifications and Enter to send are per browser (localStorage); theme is per account.

### Attachments

- A paperclip button opens the file picker (`accept` = the allowlist). The client pre-checks type and size for quick feedback; the server is the real check.
- The chosen file shows above the input (thumbnail or icon, name, size, Remove); the text becomes an optional caption.
- Sending: the bubble appears at once (status `uploading` with a progress bar, previewed from a `blob:` URL), then `sending` after the upload, then saved. An upload or ack failure → `failed` with Retry; Retry skips the upload if it already succeeded. Blob URLs are revoked when no longer needed.
- Photos show as thumbnails that open full size in a dialog; videos play inline with controls; documents are a card with name, size and a download link.
- Sidebar preview: "📷 caption or Photo", "🎥 caption or Video", "📄 file name", "🎤 Voice message".

### Voice notes

- With nothing typed and no file chosen, the composer's round button is a **mic** (it turns back into Send as soon as you type). Tap to start recording (`MediaRecorder` + `getUserMedia`, no library; an `AnalyserNode` measures loudness every 100 ms for the waveform), then **Send**, or cancel with the trash button, Escape, or by **swiping the recording strip left** past 120 px. Max 5 minutes - reaching it stops and sends. Under 0.5 s is treated as a mis-tap and not sent. A blocked or missing microphone shows a readable toast.
- Uploaded through the normal attachment route with two extra multipart fields, `durationMs` and `waveform` (a JSON array), zod-validated after multer and ignored unless the file really is audio. Then sent with `message:send` like any attachment - reply, delete, forward (keeps length and waveform) and the admin Attachments switch all apply unchanged.
- **Player** (`chat/VoicePlayer.jsx`): play/pause; the waveform doubles as the seek bar (`role="slider"`: click it, or arrow keys ±5 s, Home/End) and played bars change colour; the time; and a speed button cycling 1× → 1.5× → 2×. Only one voice note plays at a time, app-wide. Contact info lists them in a "Voice messages" section.

### Style

A WhatsApp-style look: a green accent colour (`--color-brand-*` in
`index.css` - every Tailwind utility that used to read `blue-*` now reads
`brand-*` at the same shade number, so the whole scale moves together), pale
green outgoing bubbles (`brand-100`) against white incoming ones, a subtle
doodle-pattern chat background (`.chat-background`), a circular send button,
and a top bar in the sidebar (my avatar + name, log out) instead of a footer.
Light and dark themes. Dark mode sets `<html data-theme="dark">` and
`index.css` redefines the Tailwind colour VARIABLES under it (flipped slate
scale, dark status colours, WhatsApp's dark bubble green) - no `dark:`
classes. Pure white/black must therefore be written as the tokens
`bg-surface`, `bg-overlay/<n>` and `text-meta`, never `bg-white`/`bg-black/5`
(except white text/icons on coloured buttons). `public/theme-init.js` applies
the cached theme before React loads (CSP forbids inline scripts), and
`AuthContext` applies the account's saved theme once the user loads. Use
accessible labels, visible focus rings, good contrast and full keyboard use.

**Animation:** CSS only (`@keyframes` + `.animate-*` classes in
`index.css`), no animation library. New messages slide in, dialogs/toasts/
banners fade or scale in, buttons give a tactile press, and "typing…" gets
three bouncing dots (`common/TypingDots.jsx`). Everything is inside one
`@media (prefers-reduced-motion: no-preference)` block, so a user with
reduced motion enabled gets the identical UI with no animation at all.

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
