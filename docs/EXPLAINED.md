# PingMe, explained

Plain-English notes on how each phase works and why each decision was made.
Written so that any member of the team can answer questions about any file.

---

# Phase 1 - the skeleton

**Goal of this phase:** a project that starts, answers one request, and has one
test that proves it. No chat features yet. Everything later is bolted onto this
frame, so the frame has to be right.

## 1. Why a monorepo with npm workspaces

The server and the client are two separate programs with separate dependencies,
but they are one project and one submission. npm **workspaces** lets us keep
them in one repository and one Git history, while each still has its own
`package.json`.

One `npm install` at the root installs both. npm puts the shared packages in a
single `node_modules` at the root instead of duplicating them.

> **Likely question: why not two separate repositories?**
> Then every change that touches both sides (say, adding a field to a response)
> would be split across two commits in two places, and a reviewer could not see
> them together. One repository keeps a feature in one commit.

## 2. `package.json` at the root

```json
"workspaces": ["client", "server"]
```

This one line is what makes the two folders workspaces.

The scripts are the project's public interface - nobody should need to know what
happens inside:

- `npm run dev` uses **concurrently** to run the server and the client in one
  terminal, with coloured `server` / `client` labels on each line.
- `npm start` sets `NODE_ENV=production` using **cross-env**. Plain
  `NODE_ENV=production node ...` is Unix syntax and fails on Windows
  PowerShell; cross-env makes the same script work on all three operating
  systems.
- `npm run lint` uses `--workspaces --if-present`, so it runs the `lint` script
  in every workspace that has one.

## 3. Environment variables: `server/src/config/env.js`

Secrets (the database URL, the JWT signing key) must never be written in code,
because code goes into Git. They live in `server/.env`, which `.gitignore`
excludes. `server/.env.example` is committed instead: same keys, no values, so a
new team member knows what to fill in.

Two things happen in this file.

**It loads the file.** `dotenv.config()` reads `server/.env` into `process.env`.
The path is worked out from the file's own location rather than from the current
directory, because npm scripts may be run from the repository root or from
inside `server/`.

dotenv never overwrites a variable that is already set. That is deliberate: in
production the hosting platform sets real environment variables and there is no
`.env` file at all, and in tests Vitest sets them. The file is only a
convenience for local development.

**It validates.** A zod schema describes what each variable must look like:

```js
MONGO_URI:  z.string().min(1, 'is required (a MongoDB connection string)'),
JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
```

If validation fails, the process prints the **names** of the broken variables
and exits immediately.

> **Likely question: why exit instead of carrying on?**
> Because the alternative is worse. Without validation, a missing `JWT_SECRET`
> would start the server happily and then fail on the first login with a
> confusing error - or, far worse, sign tokens with `undefined` and let anyone
> forge them. Failing at startup turns a security hole into an obvious error
> message.
>
> Note that it prints variable *names and rules*, never *values*. Printing the
> values would put the secrets into the terminal and into any log file.

`z.coerce.number()` is used for `PORT` because everything in `process.env` is a
string - `"5000"`, not `5000`.

## 4. The split between `app.js` and `server.js`

This is the most important structural decision in the phase.

**`app.js` builds the Express application and exports it. It never calls
`listen()`.**

**`server.js` imports that app, wraps it in an `http.Server`, connects to the
database, and listens.**

There are two reasons.

**Testing.** Supertest can take the exported app object and make requests
against it directly. It starts it on a random free port for the duration of each
request. If `app.js` called `listen(5000)` itself, then importing it in a test
would occupy port 5000, and two test files could not run at once.

**Socket.IO.** Socket.IO does not attach to Express; it attaches to the
underlying Node HTTP server. `app.listen()` creates that server internally and
gives us no handle on it. Creating it ourselves with `http.createServer(app)`
means Phase 5 can attach Socket.IO to the *same* server, so HTTP and WebSocket
traffic share one port.

## 5. Middleware order in `app.js`

Express runs middleware in the order it is registered, so the order is logic,
not style:

1. **`helmet()`** - sets protective HTTP headers (blocks the page being framed,
   stops browsers guessing content types, sets a Content-Security-Policy).
   First, so the headers are set even on responses from later middleware.
2. **`express.json({ limit: '10kb' })`** - parses JSON bodies. The limit
   matters: our largest legitimate body is a 2000-character message, so 10 kB is
   generous. Without a limit, someone could post a 500 MB body and tie up the
   server's memory - a cheap denial-of-service.
3. **`cookieParser()`** - makes `req.cookies` available. The session token
   arrives in a cookie from Phase 2 onward.
4. **`morgan()`** - logs each request. Skipped when `NODE_ENV=test`, or the test
   output would be buried in log lines.
5. **Routes.**
6. **`notFound`** - reached only if no route matched.
7. **`errorHandler`** - last, because Express only sends an error here after
   everything before it has been tried.

## 6. Errors: `AppError`, `notFound`, `errorHandler`

There is exactly one error type we throw on purpose:

```js
throw new AppError(404, 'No user found')
```

`errorHandler` is the only place that decides a status code and writes an error
response. Every error in the whole application funnels through it, so the error
shape `{ message }` is guaranteed to be identical everywhere.

Its signature has **four** arguments - `(err, req, res, _next)`. That is how
Express recognises an error handler; with three arguments it would be treated as
ordinary middleware and never receive errors. `_next` is unused, and the
underscore tells ESLint that this is on purpose.

Deciding the status:

```js
const status = Number.isInteger(err.status) ? err.status : 500
```

`AppError` sets `status`. Express's JSON parser also sets one (400) for a
malformed or oversized body. Anything else has no status, which means it is an
unexpected bug, which means 500.

In production a 500 returns the generic `"Something went wrong"` while the real
error is logged on the server. An unexpected error's message can contain file
paths, query fragments or library internals - useful to us, useful to an
attacker, useless to a user.

`notFound` deliberately answers a bare `'Not found'` rather than echoing the
requested URL back. Reflecting user input into a response is a habit worth not
having.

> **Likely question: Express 5 and async errors.**
> In Express 4, an async route handler that rejected would hang forever unless
> every handler was wrapped in try/catch or a helper. Express 5 forwards a
> rejected promise to the error handler automatically. That is why the route
> code in later phases has no try/catch and still handles failures correctly.

## 7. Graceful shutdown in `server.js`

On Ctrl+C (SIGINT) or a platform stop signal (SIGTERM), the server:

1. stops accepting new connections and lets in-flight requests finish
   (`server.close`),
2. disconnects from MongoDB,
3. exits.

A 10-second timer forces an exit if something refuses to close, so a stuck
connection cannot leave the process hanging. The timer is `.unref()`ed so that
it does not by itself keep the process alive.

> **Likely question: why does this matter for a college project?**
> It is what a real deployment does. A hosting platform sends SIGTERM and then
> kills the process after a grace period. Without this, the last few requests in
> flight during a restart are cut off mid-write.

## 8. The client, and why there is no CORS code

The client is React, built by **Vite**. In development Vite serves the app on
port 5173 with hot reloading; the API is a different program on port 5000.

Two different ports are two different origins, and a browser would normally
block those requests and refuse to attach cookies to them. The usual fix is to
configure CORS on the server.

We avoid the problem instead. `vite.config.js` declares a **proxy** that
forwards `/api` and `/socket.io` to `http://localhost:5000`.

The browser only ever talks to `localhost:5173`. Vite forwards those two paths
to the server behind the scenes. So there is one origin, no CORS configuration,
and the session cookie is first-party.

`ws: true` on the `/socket.io` entry is required because Socket.IO starts as an
HTTP request and then **upgrades** to a WebSocket. Without it the upgrade is not
forwarded and the connection silently falls back or fails.

This mirrors production exactly, where one Node process serves both the API and
the built React files from the same origin - so a class of bugs that only appear
in production simply cannot appear.

## 9. Production static serving

When `NODE_ENV=production`, `app.js` serves `client/dist` and then, for any GET
request that is not under `/api` and did not match a real file, returns
`index.html`.

That last part makes client-side routing survive a refresh. React Router handles
`/login` in the browser, but a hard refresh on `/login` asks the *server* for
`/login`, which is not a real file. Returning `index.html` lets React boot and
route to the right page.

It is written as plain middleware with an `if`, rather than a wildcard route.
Express 5 changed its route-pattern syntax and a bare star is no longer a valid
path - a very common upgrade error. The `if` avoids the question entirely and is
easier to read.

`app.set('trust proxy', 1)` is also set in production. Behind a platform's load
balancer, the real client IP arrives in the `X-Forwarded-For` header; without
this setting Express reports the load balancer's IP for every request, which
would make per-IP rate limiting rate-limit everybody at once.

## 10. Tests

`npm test` runs **Vitest**. Two pieces make the tests trustworthy:

**A real database, thrown away each run.** `tests/setup.js` starts
**mongodb-memory-server** - a genuine MongoDB running in memory - and connects
Mongoose to it. `afterEach` wipes every collection, so tests cannot leak state
into each other and can run in any order. Nothing touches the development
database.

> The first run downloads a MongoDB binary (about 100 MB) and needs internet. It
> is cached afterwards.

**Real HTTP requests.** Supertest sends actual requests through the actual
middleware stack, so what is tested is the same code path a browser uses -
including helmet, the JSON parser and the error handler.

The four Phase 1 tests: health returns `{ status: 'ok' }`; health needs no
authentication; an unknown route returns 404 in the `{ message }` shape; and a
malformed JSON body returns 400 instead of crashing the process.

That last one is worth keeping. It is the cheapest possible proof that the error
handler is actually wired in.

> **Likely question: why not mock the database?**
> A mock would test our idea of how MongoDB behaves. Unique indexes, validation
> and duplicate-key errors are exactly the behaviour Phase 3 depends on for
> correctness, and a mock would be happy to tell us they work when they do not.

## 11. Tailwind CSS 4

Styling is **Tailwind v4**, which is configured differently from the v3 seen in
most tutorials. There is no `tailwind.config.js` and no PostCSS file. Instead:

- `@tailwindcss/vite` is added to the plugin list in `vite.config.js`, and
- `src/index.css` contains one line that imports Tailwind.

The plugin scans the source for class names and generates only the CSS actually
used, so the stylesheet shipped to the browser is small.

**Do not add a `tailwind.config.js`** - on v4 it is ignored, and the resulting
confusion ("why is my custom colour not working?") is hard to debug.

## 12. What Phase 1 deliberately does not have

No models, no authentication, no sockets, no real pages. Each of those is a
phase of its own. The skeleton is finished when the app starts, answers
`/api/health`, fails loudly on bad configuration, and has a test proving it.

---

# Phase 2 - authentication

**Goal:** people can register, log in and log out, and every later route can
ask "who is this?" with one line.

## 1. The User model (`models/User.js`)

`username` is lowercase, trimmed, unique, must match `/^[a-z0-9_.]{3,20}$/`, and
is `immutable` - it is the public ID friends search for, so it can never
change. `passwordHash` has `select: false`: a normal query never even loads it.
Only login asks for it, explicitly, with `.select('+passwordHash')`.

## 2. Validation (`middleware/validate.js`)

Every route declares a zod schema for its body, query and params. The
middleware parses the input and puts the **cleaned** result on `req.valid`.
Controllers read only `req.valid`, never `req.body` - so unvalidated data
cannot reach a service by accident.

zod also lowercases and trims usernames and emails, so "Aman " and "aman" are
the same account.

> **Likely question: what is NoSQL injection and how do you stop it?**
> If a login body were `{ "identifier": { "$ne": null } }` and it went straight
> into `User.findOne({ username: identifier })`, MongoDB would read `$ne: null`
> as an operator - "any user whose username is not null" - and match the first
> account. Our schemas say `z.string()`, so an object is rejected with 400
> before it gets anywhere near the database. There is a test for exactly this.

## 3. Registering (`services/authService.js`)

The password is hashed with **bcryptjs, cost 12**. The cost is the number of
rounds as a power of two (2^12 = 4096): slow enough (about a quarter of a
second) that guessing millions of passwords from a stolen database is
impractical, fast enough that one login is not noticeable.

We do **not** check "is this username taken?" before inserting. Two people
signing up with the same name at the same moment could both pass that check.
Instead we just insert and let the **unique index** refuse the second one.
MongoDB reports that as error code **11000**, which we translate to
`409 Username already taken` (or `Email already registered` - `keyPattern`
tells us which index failed).

Password length is 8-72 because bcrypt only uses the first 72 bytes. A longer
password would be silently cut short, which is worse than refusing it.

## 4. Logging in

`identifier` may be a username or an email. A username can never contain `@`,
so one query with `$or` covers both.

An unknown user and a wrong password give the **same** `401 Invalid
credentials`. Otherwise the login form would tell an attacker which usernames
exist. We go one step further: for an unknown user we still run
`bcrypt.compare` against a dummy hash, so both cases take the same time and the
response time does not give it away either.

## 5. The session cookie

On success the server signs a JWT `{ sub: userId }` valid for 7 days and sends
it in a cookie named `token`:

| Option | Why |
|---|---|
| `httpOnly` | Page JavaScript cannot read it, so even an XSS bug cannot steal the session |
| `sameSite: 'lax'` | The browser does not send it on cross-site POSTs - this blocks CSRF |
| `secure` (production) | Only ever sent over HTTPS |
| `maxAge` 7 days | Matches the JWT's expiry |

The token is **never** in the response body or in localStorage.

> **Likely question: why a cookie and not localStorage?**
> Anything in localStorage can be read by any script on the page. One XSS bug
> or one malicious npm package and every session is stolen. An httpOnly cookie
> is invisible to JavaScript. The cost is CSRF risk, which `sameSite: 'lax'`
> handles.

## 6. `requireAuth`

Reads the cookie, verifies the JWT (pinned to `HS256`, so a token cannot claim
a weaker algorithm), loads the user and sets `req.user`. A deleted user's old
token stops working because the user lookup fails. The same check,
`userFromToken`, is reused by the socket handshake in Phase 5.

## 7. Rate limits (`middleware/rateLimits.js`)

| Limit | Keyed by | Why |
|---|---|---|
| Register + login: 10 / 15 min | IP | Slows password guessing and mass sign-ups |
| Search: 30 / min | user | Stops fast username guessing |
| Friend requests: 20 / hour | user | Stops spamming requests |

Per-user limits count by account, so students sharing one college IP do not
use up each other's allowance.

The limits are **off in tests** (every test comes from the same IP and would
lock the suite out), except in `tests/rateLimits.test.js`, which turns them
back on and proves the 11th login attempt gets a 429. They can never be
switched off outside `NODE_ENV=test`.

---

# Phase 3 - the friend system

**Goal:** the core privacy feature. You find people only by exact username,
and you can only chat with accepted friends.

## 1. `pairKey` - one document per pair

`pairKey(a, b)` sorts the two ids and joins them with `_`. So
`pairKey(aman, priya) === pairKey(priya, aman)`.

Friendship has a **unique index on pairKey**. That single fact makes several
bugs impossible at database level:

- sending the same request twice,
- Aman to Priya and Priya to Aman at the same moment creating two requests,
- two friendships between the same people.

A pair keeps the same document for its whole life: pending, then accepted -
or pending, declined, and pending again.

## 2. Search is exact-match only

`User.findOne({ username })` - no regex, no prefix, no "contains". If search
matched partially, searching "a", "b", "c"... would list every account, which
is exactly what this app must prevent. The response is only
`{ user: { id, username, displayName }, relationship }`.

`relationship` is one of `self`, `none`, `pending_outgoing`,
`pending_incoming`, `friends`. A **declined** request shows as `none` to both
sides, so the requester is never told they were declined.

## 3. Sending a request - the order of checks

1. Target does not exist: 404.
2. Target is me: 400.
3. Look up the pair's Friendship:

| Found | Result |
|---|---|
| nothing | create it, `pending` |
| pending, I sent it | 409 Request already sent |
| pending, **they** sent it | accept it - they already asked me, so my request means yes |
| accepted | 409 Already friends |
| declined, I sent it, within 7 days | 429 - you cannot pester someone who said no |
| declined, otherwise | reuse the document as a new request from me |

If two creates race, the unique index lets one through and the other gets
error 11000, which we report as "Request already sent".

## 4. Accept - one atomic operation

```js
Friendship.findOneAndUpdate(
  { _id, recipient: me, status: 'pending' },
  { status: 'accepted', respondedAt: now },
)
```

The **filter does the security work**. `recipient: me` means only the person
who was asked can accept. `status: 'pending'` means a double click cannot
accept twice - the second call finds nothing and gets 404. There is no
"read, check, then write" gap for a race to slip into.

Then the Conversation is **upserted** by pairKey with `$setOnInsert`: created
the first time, and simply found again if the pair were friends before - so
unfriending and re-friending brings the old history back.

## 5. Decline, cancel, unfriend

- **Decline** - same atomic pattern; the requester is deliberately not notified.
- **Cancel** - only the requester, only while pending; the document is deleted.
- **Unfriend** - deletes the Friendship but **keeps** the Conversation and
  messages. Sending checks friendship, so the chat just becomes read-only.

## 6. The two guards

```js
assertParticipant(conversationId, userId) // returns it, or 404
assertFriends(userA, userB)               // or 403 "You can only message friends"
```

Every message read or write calls these. `assertParticipant` answers **404,
not 403**: "forbidden" would confirm the conversation exists, while "not found"
tells an outsider nothing.

> **Likely question: you hide non-friends in the UI - isn't that enough?**
> No. Anyone can open the browser's dev tools, or use Postman, and call the
> API directly. The UI is for convenience; the server is where the rules live.
> Our tests call the API directly to prove it.

## 7. `emitToUser` (`socket/emitter.js`)

Services announce events (new request, accepted, cancelled, removed) through
`emitToUser(userId, event, payload)`. It holds a reference to Socket.IO that
is set at startup. In REST tests Socket.IO is never started, the reference is
null, and the call does nothing - so the services work identically with or
without sockets.

---

# Phase 4 - message history

**Goal:** load a conversation's messages, newest page first, and older pages
as you scroll up.

## 1. Models

- **Conversation** - two sorted participants, unique `pairKey`, and a copy of
  the `lastMessage` so the sidebar preview needs no extra query per friend.
- **Message** - conversation, sender, text (trimmed, 1-2000), and `clientId`.

Indexes: `{ conversation: 1, _id: -1 }` answers "messages of this conversation,
newest first" directly; a unique `{ sender: 1, clientId: 1 }` makes retries
safe (Phase 5).

## 2. Keyset (cursor) pagination

`GET /api/conversations/:id/messages?before=<messageId>&limit=30`

We query `_id < before`, sort by `_id` descending, and fetch **limit + 1**
rows. If the extra row exists, `hasMore` is true. The page is reversed to
oldest-to-newest for display.

> **Likely question: why not `skip` and `limit` (page numbers)?**
> Two reasons. **Correctness:** if a new message arrives while you scroll,
> every "page 2" shifts by one, so you see a message twice or miss one. A
> cursor ("older than this exact message") does not move. **Speed:**
> `skip(3000)` still walks past 3000 documents; a cursor jumps straight there
> using the index.

MongoDB ObjectIds start with a timestamp, so ordering by `_id` is ordering by
time.

`limit` is validated (1-50) and `before` must be a valid ObjectId, so nobody
can ask for the whole history in one request.

Reading history needs only `assertParticipant`, not `assertFriends`, so after
an unfriend both people can still read (but not send).

---

# Phase 5 - Socket.IO

**Goal:** messages, presence and friend events arrive instantly.

## 1. Same server, same cookie

Socket.IO is attached to the same `http.Server` as Express, so HTTP and
WebSockets share one port and one origin. The handshake carries the same
httpOnly cookie as REST calls; `socketAuth` parses it with the `cookie`
package, verifies the JWT with the same `userFromToken` as `requireAuth`, and
sets `socket.data.userId`. No valid session means
`next(new Error('Unauthorized'))` and the connection is refused.

## 2. Rooms, not socket ids

On connect, each socket joins `user:<id>`. All of a user's tabs are in that
room, so "tell Priya" is always `io.to('user:' + priyaId)`. We never store
socket ids, which go stale the moment a tab reloads.

## 3. Sending a message - the mandatory order

`message:send` with an acknowledgement callback:

1. rate limit, then validate with zod
2. `assertParticipant`
3. `assertFriends`
4. save the Message
5. update `Conversation.lastMessage`
6. emit `message:new`
7. `ack({ ok: true, message })`

If anything fails before step 4, nothing is emitted and the ack is
`{ ok: false, error }`. **A message can never appear on someone's screen
without being in the database.**

The emit is `socket.to('user:' + other).to('user:' + me).emit(...)`.
`socket.to` excludes the sending socket, so the recipient's tabs and my
*other* tabs get the event, and my sending tab gets the message in the ack.

**Idempotency:** the browser makes a `clientId` (UUID) before sending. If the
ack is lost and the browser retries with the same clientId, the server finds
the existing message and returns it instead of saving a duplicate. The unique
index on `(sender, clientId)` backs this up even if two retries race.

## 4. Presence - counting connections

`presenceService` is a `Map` of userId to the number of open connections.

- connect: count +1; if it became **1**, tell each friend `online: true`.
  Always send the new socket a `presence:snapshot` of online friends.
- disconnect: count -1; if it became **0**, save `lastSeen` and tell friends
  `online: false, lastSeen`.

> **Likely question: why count instead of a true/false flag?**
> With two tabs open, closing one would set the flag to false and show you as
> offline while you are clearly still here. Counting 2 to 1 correctly stays
> online.

Friend ids are read from the database each time (not cached), so presence can
never go to someone who was just unfriended. Presence only ever goes to
friends.

## 5. Robust handlers

Every handler checks `typeof ack === 'function'`, validates its payload and
wraps its work in try/catch. A malformed event, a null payload or a missing
callback cannot crash the process - there are tests for each. Unexpected
errors are logged and the client only sees "Could not send message".

The per-socket rate limit (10 messages per 5 seconds) is a small sliding
window: keep the timestamps of recent sends and refuse when there are already
10 inside the window.

---

# Phase 6 - client authentication

## 1. The axios instance (`api/http.js`)

`baseURL: '/api'` (relative - no server address anywhere in the client) and
`withCredentials: true`. A response interceptor watches for **401**: on any
call except `/auth/me` and `/auth/login` it means the session has ended, so it
clears the user, which sends them to `/login`.

## 2. `AuthContext` and no login flash

The cookie is httpOnly, so JavaScript cannot look at it to know whether you
are logged in. On load we ask the server (`GET /api/auth/me`) and show a
full-screen spinner until it answers. Without that, a logged-in user
refreshing the page would briefly see the login form before being redirected.

## 3. Routes (`App.jsx`)

Three routes, and all the redirect rules in one place: logged out, `/`
redirects to `/login`; logged in, `/login` and `/register` redirect to `/`;
anything unknown goes to `/`. In production the server returns `index.html`
for these paths, so a hard refresh works.

On logout the zustand store is reset, so the next person on the same computer
sees nothing of the previous user's data.

---

# Phase 7 - the sidebar

## 1. One store (`store/useChatStore.js`)

zustand holds `friends`, `requests`, `messagesByConversation`, `presence`,
`activeConversationId` and `unreadCounts` (plus small UI state: the selected
tab, the connection status, toasts). Components subscribe to just the slice
they need, e.g. `useChatStore((s) => s.friends)`, and only re-render when that
slice changes.

Unread counts live only in the browser: the specification has no server-side
"read" state, so they start at zero after a reload.

## 2. The three tabs

- **Chats** - avatar with online dot, name, preview ("You: ..." for mine),
  time, unread badge; sorted by latest message. The empty state shows my
  `@username` with a copy button, because nobody can find me unless I share it.
- **Requests** - incoming with Accept / Decline, sent with Cancel.
- **Add Friend** - one exact-username search, one result card whose button
  depends on `relationship`. The card also watches the store, so if they
  accept while you are looking at it, it changes to "Message" by itself.

The tabs use the ARIA `tablist` pattern (arrow keys move between tabs), every
input has a real `<label>`, and every icon-only button has an `aria-label`.

## 3. Avatars

Initials on a coloured circle; the colour comes from a hash of the username, so
it is the same everywhere without storing anything. All colours pass contrast
checks with white text.

---

# Phase 8 - the chat window

## 1. One socket, one place for listeners

`SocketProvider` creates exactly one socket with `io({ withCredentials: true })`
and disconnects it on unmount (logout). It is only rendered on the logged-in
route.

**Every** listener is registered in `hooks/useSocketEvents.js` inside one
`useEffect`, with a matching `socket.off` in the cleanup.

> **Likely question: why does the cleanup matter so much?**
> React's StrictMode runs every effect twice in development to catch exactly
> this. Without `socket.off`, the second run adds a second listener and every
> message appears twice. The same would happen in production whenever the
> component re-mounts.

## 2. Optimistic sending

1. Make a `clientId` with `crypto.randomUUID()` and show the bubble at once,
   marked *sending* (clock icon).
2. Emit with `socket.timeout(10000)`.
3. Ack `ok`: replace the bubble with the saved message (tick icon).
4. Ack error, or no ack within 10 seconds: mark it *failed* with a **Retry**
   button, which resends the **same** clientId - so if the first attempt had
   actually been saved, the server returns it rather than storing it twice.

## 3. No duplicates

The store merges messages **by clientId**. A message that arrives twice (the
ack plus a reconnect refetch, or two tabs) simply replaces itself. Incoming
`message:new` events whose id is already present are ignored.

## 4. Scrolling

- New message and you are near the bottom (or it is yours): scroll down.
  Otherwise show a **"New messages"** pill instead of yanking you away from
  what you were reading.
- Scroll near the top: load the older page. Before it loads we remember the
  scroll height; after, we set `scrollTop` so the same message stays under
  your eyes. This runs in `useLayoutEffect` - after the DOM updates but before
  the browser paints - so there is no visible jump.

## 5. Reconnecting

While the socket is disconnected a "Reconnecting..." banner shows. Socket.IO
reconnects by itself; on a **re**-connect (not the first connect) we refetch
friends, requests and the open conversation's latest page, because events
sent while we were offline are gone. MongoDB is the source of truth, so a
refetch always gives the correct state.

## 6. Safe text

Message text is rendered as a plain React text node, which React always
escapes: `<b>hi</b>` shows exactly those characters. There is no
`dangerouslySetInnerHTML` anywhere. `white-space: pre-wrap` keeps line breaks
(Shift+Enter).

## 7. Mobile

Below 768 px only one panel shows: the list, or the open chat with a back
button. The layout uses `h-dvh` (dynamic viewport height) so the input is not
hidden behind a phone's address bar.

---

# Phase 9 - polish, tests, deployment

## 1. End-to-end tests (Playwright)

`npm run test:e2e` builds the client and starts the **production** server
(`e2e/start-server.js`) against a throw-away in-memory MongoDB. Two isolated
browser contexts act as two people on two computers: they register, fail a
partial search, find each other by exact username, send and accept a request
(live toasts on both sides), chat both ways, refresh (session and history
survive), and one leaves (the other sees "Last seen"). This tests the exact
build that gets deployed, including static serving and cookies.

## 2. Seed script

`npm run seed` creates four demo users, two friendships, a conversation with
messages spread over two days (so "Yesterday" and "Today" separators show) and
a pending request. It **refuses to run in production** and never deletes
anything - if the demo users already exist, it stops.

## 3. Deployment

One Node service (Render) plus MongoDB Atlas; `render.yaml` describes the
service so Render configures itself. See `docs/DEPLOY.md`. `npm audit` reports
no vulnerabilities in production dependencies.

---

# Phase 10 - profiles (picture, bio, display name, username)

**Goal:** people can make their profile their own, without weakening the
privacy rules from Phase 3.

## 1. What changed in the rules

Three original rules were changed on purpose, with the team's approval:

| Before | Now | Why |
|---|---|---|
| Username can never change | Once every 30 days | People outgrow usernames; the cooldown stops abuse |
| No image uploads | Profile pictures (and, in Phase 11, attachments) | Requested feature |
| PublicUser = id, username, displayName | + `bio`, `avatarUrl` | So friends (and people who search your exact username) can see them |

Email is still only ever sent to its owner.

## 2. Where files live: GridFS (`services/storageService.js`)

A MongoDB document can be at most 16 MB, and putting photos inside normal
documents would make every query that loads a user slow. **GridFS** is
MongoDB's built-in answer: it splits a file into 255 kB chunks and stores
them in two collections, `uploads.files` (name, size, type) and
`uploads.chunks` (the bytes).

> **Likely question: why not save files to the server's disk?**
> On hosts like Render the disk is wiped on every deploy, so every picture
> would vanish. And with only one database there is only one thing to back
> up, secure and explain.
>
> **Why not a cloud service like Cloudinary?** It would need another account,
> more secrets, and its files sit on public web addresses - so privacy would
> depend on nobody guessing a URL. With GridFS every download goes through our
> own permission checks.

`storageService.js` is the **only** file that knows where the bytes live
(`saveFile`, `getFileInfo`, `openFile`, `deleteFile`). Moving to S3 later would
mean rewriting that one file.

## 3. Checking what a file really is (`utils/fileType.js`)

A file's name and the Content-Type the browser sends are both chosen by the
uploader, so we trust neither. Almost every file format starts with a fixed
**signature** ("magic number"):

| Starts with | It is |
|---|---|
| `FF D8 FF` | JPEG |
| `89 50 4E 47 0D 0A 1A 0A` | PNG |
| `GIF87a` / `GIF89a` | GIF |
| `RIFF....WEBP` | WebP |
| `%PDF-` | PDF |

`detectFileType` reads the first bytes and returns `{ mime, kind }` from an
**allowlist**, or `null`. An HTML page renamed `photo.jpg` starts with
`<html>`, so it is refused.

> **Likely question: why are SVG and HTML never allowed?**
> Both can contain `<script>`. If our server ever served one inline from our
> domain, the script would run with the user's session - a stored XSS attack.
> The safest rule is never to accept them at all.

## 4. The profile picture

1. The user picks a picture. **In the browser**, `utils/image.js` draws the
   largest centred square onto a 256×256 canvas and exports it as WebP. A
   4 MB phone photo becomes about 20 kB - quicker to upload, and the server
   needs no image library.
2. `PUT /api/users/me/avatar` - multer (`middleware/upload.js`) reads the file
   into memory with a 2 MB limit enforced *while streaming*; the magic bytes
   must say JPEG/PNG/WebP/GIF; it is saved to GridFS.
3. `findOneAndUpdate(..., { new: false })` swaps in the new file id and hands
   back the *old* document, so we know exactly which old file to delete.

`avatarUrl` is `/api/users/:id/avatar?v=<file id>`. A new picture gets a new
file id, so the URL changes and every browser fetches it again; an unchanged
picture keeps its URL, so it can be cached for a year (`immutable`).

## 5. Changing the username - the same atomic pattern as Phase 3

```js
User.findOneAndUpdate(
  { _id: me, $or: [{ usernameChangedAt: null }, { usernameChangedAt: { $lte: thirtyDaysAgo } }] },
  { $set: { username, usernameChangedAt: now } },
)
```

The cooldown is **in the filter**, so it is checked and applied in one step.
Two changes sent at the same moment cannot both pass - one gets the document,
the other gets `null` → 429. There is a test that sends two at once.

A taken username still relies on the **unique index** (error 11000 → 409),
exactly like registration. JWTs and friendships use the user's **id**, never
the username, so changing it logs nobody out and breaks no friendship.

> **Likely question: is there a downside to allowing username changes?**
> Yes - the old username becomes free, and someone else could take it. People
> who only knew the old name might then add the wrong person. That is why
> changes are limited to once in 30 days and the app warns before saving.

## 6. Everyone sees the change live - `user:updated`

After any profile change, `announce()` emits `user:updated`:

- to everyone who has me in a list (friends, and pending requests either way):
  the **PublicUser** shape;
- to my own room (my other tabs): the **SelfUser** shape, which includes my
  email.

The client's `useSocketEvents` either updates that person everywhere in the
store, or - if it is me - merges it into `AuthContext`. The hook now depends
on my *id* rather than the whole user object, so editing my profile does not
tear down and re-add every socket listener.

## 7. The profile dialog

Built on the browser's own `<dialog>` element with `showModal()`, which gives
for free: focus moves into the dialog and stays there, Escape closes it,
clicking the dark backdrop closes it, and screen readers announce it. Save
sends **only the fields that changed**.

---

# Phase 11 - attachments (photos, videos, documents)

**Goal:** send files in a chat, with the same privacy guarantees as text.

## 1. Two steps, so the Phase 5 rule still holds

Phase 5 says a message is sent **only** through `message:send`, in a fixed
order. A 25 MB video cannot sensibly travel inside a socket event, so sending
a file is split:

1. **Upload** (REST, `POST /api/conversations/:id/attachments`) - the file is
   stored and an `Attachment` document is created with `message: null`.
2. **Send** (`message:send` with `attachmentId`) - the normal 7-step order;
   step 4 now "claims" the attachment for the new message.

## 2. The upload route - order matters

```
uploadLimiter -> validate :id -> checkCanUpload -> singleFile('file', 25 MB) -> upload
```

`checkCanUpload` (`assertParticipant` + `assertFriends`) runs **before** multer
reads the body. A stranger - or an ex-friend - is turned away without the
server receiving a single byte of their file.

Then: magic-byte type check, a per-kind size limit (photos and documents
10 MB, videos 25 MB), GridFS, and the Attachment document. The file name is
reduced to its base name with control characters removed, because it is shown
to the other person and sent back in a download header.

## 3. Claiming - one atomic step again

```js
Attachment.findOneAndUpdate(
  { _id: attachmentId, uploader: me, conversation: conversationId, message: null },
  { message: newMessageId },
)
```

Each part of the filter blocks one attack:

| Filter | Stops |
|---|---|
| `uploader: me` | sending someone else's upload |
| `conversation: conversationId` | moving a file into a different chat |
| `message: null` | attaching one file to two messages |

The message id is created *before* the claim (`new ObjectId()`), so the
attachment can point at the message and the message at the attachment. If
saving the message then fails, the claim is released.

## 4. Downloading - `GET /api/attachments/:id`

`getForDownload` answers **404** unless you are in that conversation - and,
until it has been sent, unless you uploaded it. As with conversations, 404
(not 403) tells an outsider nothing about whether the file exists.

`utils/sendStoredFile.js` streams it from GridFS with these headers:

| Header | Why |
|---|---|
| `Content-Type` = the type detected at upload | never guessed from the name |
| `Content-Disposition: inline` for photos/videos | shown inside the chat |
| `Content-Disposition: attachment` for documents | always downloaded, never opened on our domain |
| `X-Content-Type-Options: nosniff` (helmet) | the browser may not second-guess the type |
| `Cache-Control: private, max-age=86400` | only the user's browser may cache it |

> **A bug caught while building this:** Express's `res.attachment(name)` also
> sets `Content-Type` from the file's *extension*. A PDF named `evil.html`
> would have been sent as `text/html`. The fix is to set our own
> `Content-Type` *after* calling it; a test uploads exactly that file.

## 5. Video seeking - HTTP Range requests

A `<video>` does not download the whole file before playing. It asks for
parts: `Range: bytes=1000000-`. The server answers **206 Partial Content**
with `Content-Range: bytes 1000000-1999999/2000000` and just those bytes
(GridFS can start and stop a stream anywhere). A range past the end gets
**416**. This is what makes the seek bar work, especially on Safari and
iPhones, which refuse to play video from servers without Range support.

## 6. Cleaning up abandoned uploads

If someone picks a file and then closes the tab, the upload is never used.
Every hour (`server.js`, and once at startup) `deleteUnsentUploads` removes
uploads that are still unsent after an hour. It deletes the **document first,
only if still unsent**, then the bytes - so a message sent at that exact
moment can never end up pointing at a deleted file.

## 7. The client

- **Picking:** the paperclip opens the file picker. `utils/files.js`
  pre-checks the extension and size for quick feedback - only a convenience,
  the server checks the real bytes.
- **Preview before sending:** the browser makes a temporary `blob:` URL for
  the chosen file. helmet's Content-Security-Policy normally forbids `blob:`
  images, so `app.js` allows `blob:` for `img-src` and `media-src` only. The
  blob URL is released (`URL.revokeObjectURL`) when no longer shown, or its
  memory would stay allocated.
- **Sending:** the bubble appears at once with status `uploading` and a
  progress bar (axios `onUploadProgress`), then `sending`, then saved. If it
  fails, **Retry** skips the upload when that part already worked, and resends
  with the same `clientId` - so it is still never stored twice.
- **Showing:** photos as thumbnails that open full size, videos with native
  controls, documents as a card with name, size and a download link.
- **Scrolling:** a photo only gets its real height once it loads, *after* the
  auto-scroll ran. `onLoad` re-scrolls to the bottom if the user was there.

## 8. Limits of this design

- The free Atlas cluster holds **512 MB in total**. That is plenty for a demo
  and a viva, not for heavy video use. Moving to S3/R2 would only change
  `storageService.js`.
- multer keeps the file in **memory** while checking it (max 25 MB per
  upload, 20 uploads per hour per user). Fine for one small server; a large
  deployment would stream straight to storage instead.

---

# Phase 12 - forgot password and change password

**Goal:** two things people expect from any real account system, added after
Phase 11, with the team's approval (this changes nothing already built - it
is purely new).

## 1. Sending real email: Brevo, and why no library

Forgot-password only makes sense if a real email reaches the user. We use
**Brevo** (a free transactional-email API, 300 emails/day). Brevo's API is a
single `POST` request with an API key header - Node's built-in `fetch` is
enough, so no SDK was added, matching the project's "avoid unnecessary
libraries" rule.

`services/emailService.js` is the *only* file that knows how email is sent.
Swapping providers later would only change this one file - the same pattern
as `storageService.js` for files.

**In tests, nothing is sent over the network.** `isTest` (from
`config/env.js`) makes `emailService` push every email into an exported
array, `sentEmails`, instead of calling Brevo. A test can then read the exact
subject, recipient and reset link that would have gone out - deterministic,
offline, and fast.

**A missing or wrong Brevo key never breaks a request.** If `BREVO_API_KEY`
or `EMAIL_FROM_ADDRESS` is not set - or Brevo itself errors - `emailService`
logs it and simply returns, rather than throwing. Forgot-password's response
to the *user* must be identical whether or not sending actually worked
(see below), so failures are only ever visible in the server's own logs.

## 2. Never revealing who has an account

`POST /api/auth/forgot-password` always answers:

```json
{ "message": "If an account exists for that email, we've sent a password reset link." }
```

whether or not that email belongs to anyone. This is the same idea as
login's identical 401 for "wrong password" and "no such user" (Phase 2): if
the response differed, someone could try a list of emails and learn exactly
which ones are registered.

## 3. The reset token: generated, hashed, single-use, time-limited

```js
const token = crypto.randomBytes(32).toString('hex')       // sent in the email
user.resetPasswordTokenHash = sha256(token)                 // stored instead
user.resetPasswordExpires = now + 1 hour
```

Exactly the same reasoning as `passwordHash`: the **raw** token is never
stored anywhere. If the database were ever stolen, the thief could not reset
anyone's password with it - they would need the original 64 random hex
characters, which only ever existed in the one email that was sent.

`resetPasswordTokenHash` and `resetPasswordExpires` both have `select:
false` (like `passwordHash`), so an ordinary `User.findOne(...)` never loads
them by accident.

**Resetting the password:**

1. Look up the user by email, re-hash the *given* token, and compare.
2. Any mismatch, or an expired `resetPasswordExpires`, gives the identical
   400 "That reset link is invalid or has expired" - never a more specific
   reason (a specific "wrong token" vs "expired" message would leak whether
   a given link was ever valid).
3. On success: hash the new password, set `passwordChangedAt`, and **clear**
   `resetPasswordTokenHash` / `resetPasswordExpires` - not just mark them
   expired. Clearing is what makes a link strictly single-use: reusing it
   finds `null` where a hash should be, and fails the same way an unknown
   token would.

The client does **not** log the user in after a reset - it sends them to
`/login` with a green banner. A fresh, explicit login is a clearer signal
that the new password is the one now in effect.

## 4. Signing out every OTHER device - without a token blacklist

This is the part with the most interesting bugs, found and fixed while
building it.

**The idea:** add `passwordChangedAt` to the user. Reject any session token
issued *before* that moment. No database of "valid tokens" is needed - each
token already proves when it was made.

**Bug 1 - JWT's `iat` is only whole seconds.** The first version compared the
token's built-in `iat` (issued-at, seconds since epoch, added automatically by
`jwt.sign`) against `passwordChangedAt` (millisecond precision). Reissuing the
cookie *immediately after* setting `passwordChangedAt` (to keep the current
tab logged in - see below) could produce a token whose `iat` rounds *down* to
just **before** `passwordChangedAt`, in the same second - so the very cookie
just issued rejected itself. Flooring both sides to the same second fixed
that, but broke the other direction: two requests landing in the *same*
wall-clock second (routine in a fast automated test, and not impossible for a
human either) became indistinguishable, so a genuinely stale token from
*just* before the change could still pass.

**The real fix: our own millisecond timestamp.** `signToken` now signs
`{ sub, ts: Date.now() }` - `ts` is ours, not JWT's `iat`, and has full
millisecond precision:

```js
if (user.passwordChangedAt && decoded.ts < user.passwordChangedAt.getTime()) {
  return null // stale - this device must log in again
}
```

Now: a token signed a moment *before* the password changed always has a
smaller `ts` and is correctly rejected; a cookie reissued a moment *after*
always has a larger `ts` and is correctly accepted - regardless of which
second either happens to fall in.

This one check lives in `userFromToken`, shared by `requireAuth` (REST) and
the socket handshake - exactly like the rest of the session logic - so both
paths are protected by writing it once.

> **Known limitation:** a session cookie issued *before* this feature shipped
> has no `ts` claim. For those, the check is simply skipped (`undefined <
> number` is `false` in JavaScript), so a handful of very old sessions are not
> retroactively covered. They age out naturally within 7 days, or the moment
> that device logs in again and gets a `ts`-bearing token.

## 5. Change password: keeping the current tab logged in on purpose

`PATCH /api/auth/password` (logged in) checks `currentPassword` with bcrypt,
then behaves like a reset: hash the new password, set `passwordChangedAt`.

The difference from reset: it **reissues the cookie** in the same response.
Since the fresh cookie's `ts` (signed a moment after `passwordChangedAt`) is
always later, it survives its own `userFromToken` check - so the tab that
changed the password stays logged in, while every *other* browser or device
gets signed out the next time it makes a request. That is the whole point of
the feature: if a session was left open somewhere, changing the password from
anywhere else ends it immediately.

**Bug 2 - the wrong status code.** The first version answered a wrong
`currentPassword` with **401**. But `api/http.js`'s axios interceptor treats
*any* 401 (other than on `/auth/me` and `/auth/login`) as "the session
expired" and force-logs the user out. So typing the wrong current password
was silently logging people out instead of showing "Current password is
incorrect" in the dialog - found by an end-to-end test that expected the
message and instead landed back on the login page. The fix: this is **400**,
not 401 - the request already passed `requireAuth`, so the *session* is
valid; only the *value* was rejected, which is exactly what 400 means.

## 6. Testing an email flow without a real inbox

Server tests read the reset link straight out of `emailService.sentEmails`
(captured instead of sent, see above), so the *whole* round trip - request a
reset, follow the link, set a new password, confirm the old one now fails and
the new one works, confirm every other device is logged out - is tested with
no real network call.

The end-to-end suite runs the real production server, which cannot use that
test-only capture (there is no real Brevo key configured for it). So it
covers only what does not depend on email actually arriving: the request
form always shows the same message, and a malformed reset link shows a clear
error instead of a broken form. **Change password** needs no email at all, so
it gets full end-to-end coverage, including two separate browser "devices"
proving one is logged out while the other stays in.

> **A third bug caught by these end-to-end tests:** `getByLabel('Email')`
> and `getByLabel('Password')` (without `{ exact: true }`) can substring-match
> the *wrong* field - "Email" also matches inside "Username or **email**",
> "Password" also matches the "Show **password**" toggle button's label. This
> only showed up as a flaky, hard-to-reproduce failure during the brief
> moment a page is still transitioning between routes, because the *old*
> page's fields can briefly still be in the DOM. Every ambiguous label in the
> test suite now uses `exact: true`.
