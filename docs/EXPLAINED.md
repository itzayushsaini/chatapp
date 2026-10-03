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

---

# Phase 13 - read receipts and a WhatsApp-style look

**Goal:** the app was reskinned to look like WhatsApp, and gained a real new
feature along the way: the blue double-tick that shows when someone has
actually read your message.

## 1. Read receipts - the data model

WhatsApp shows three states (sent, delivered, read). This app only shows
**two**: a single grey tick once a message is saved, and two **blue** ticks
once the other person has actually opened that chat. A middle "delivered"
state was deliberately left out - in a web chat where the full history is
always one REST call away, "delivered" would not carry an honest signal the
way it does for a mobile app relying on push notifications. Faking that
extra step would be theatre, not information.

The read pointer is stored **per conversation, not per message**:

```js
Conversation.lastRead = Map<userId, { upTo: messageId, at: Date }>
```

Only two entries ever exist - one per participant. "Have they read message
X?" is then just `X.id <= theirPointer.upTo` - a plain string comparison,
because MongoDB ObjectIds are the same length and sort the same way whether
compared as ObjectIds or as hex strings. This is far cheaper than writing a
"read by" flag onto every message row, and it is exactly how WhatsApp itself
models it (a read pointer, not per-message receipts, for a 1:1 chat).

## 2. The socket event, and why it needs no ack

`conversation:read { conversationId, upToMessageId }` is fire-and-forget: the
client does not wait for a reply. Unlike `message:send`, there is nothing
here that could be lost silently - if the event never arrives, the recipient
simply keeps their existing tick colour, and the next read event (opening the
chat again, or a later message) fixes it. That is a meaningfully different
risk profile from a chat message, which is why it gets a lighter contract.

**The pointer only ever moves forward.** The handler compares the incoming
`upToMessageId` against the caller's current pointer and does nothing if it
is not actually further along:

```js
if (current?.upTo && String(current.upTo) >= String(upToMessageId)) return null
```

This means an event that arrives out of order (network reordering, or two
tabs both reporting "read") can never move the pointer *backwards*, and the
sender is only ever told about it once - `markRead` returns `null` when
nothing changed, and the socket handler only emits `message:read` when it
gets a real id back.

## 3. Three moments the client marks something as read

1. **Opening a chat.** `ChatWindow` has an effect that fires whenever the
   *latest loaded message's id* changes (not on every store update - the
   dependency is specifically `entry.messages.at(-1)?.id`, so things like a
   presence tick elsewhere in the store cannot cause a needless re-emit).
2. **A message arriving while that chat is already open.** Handled in
   `useSocketEvents`' `onMessage`, right next to where the message is added
   to the store - if it is from the other person AND this conversation is
   the currently active one, `conversation:read` fires immediately, so the
   tick turns blue without the sender having to wait for the recipient to
   "open" anything they already have open.
3. **After a reconnect**, for whatever the refetched history's latest message
   turns out to be - catches up on anything that arrived while offline.

## 4. Showing it without waiting for a live event

`GET /api/conversations/:id/messages` now also returns `theirReadUpTo` - the
other participant's current pointer - so a freshly opened chat shows the
correct tick colours on old messages immediately, without waiting for a
`message:read` event that might never come again (they already read it
yesterday; nothing new will re-announce that).

The client keeps this in the store as `readUpTo[conversationId]`, updated
either from that REST field or from a live `message:read` event -
`setReadUpTo` applies the exact same "only move forward" rule client-side as
the server does, so a stale event can never flicker a tick backwards.

> **A bug caught by e2e tests, twice.** The very first version of the new
> read-receipt end-to-end test asserted on `getByText('Read')`, and it kept
> failing - not because read receipts were broken, but because the test's own
> message text was `"Hi, already looking?"`, and `"alREADy"` contains the
> substring `"read"`. Playwright's `getByText` matches by substring by
> default, so the assertion matched the message bubble's own text instead of
> the tick's status label. The fix (used everywhere a similarly generic word
> could collide, e.g. "Email" inside "Username or **email**", back in Phase
> 12) is `{ exact: true }` on any status label that is a short, everyday
> word.

## 5. The WhatsApp look - one colour token, not scattered hex values

Every place the app used Tailwind's `blue-*` classes (`bg-blue-600`,
`ring-blue-500`, `hover:bg-blue-700`, ...) now uses `brand-*` at the *same*
shade number instead. The actual colours are defined once, in `index.css`:

```css
@theme {
  --color-brand-600: #00a884; /* buttons, links, active states */
  --color-brand-100: #d9fdd3; /* outgoing message bubble */
  --color-tick-read: #53bdeb; /* the blue double tick */
}
```

Tailwind v4 turns any `--color-*` variable in `@theme` into a full set of
utilities automatically (`bg-brand-600`, `text-brand-600`, `hover:bg-brand-700`,
...), which is why a single find-and-replace of `blue-` → `brand-` across
every component, followed by defining the scale once, was enough to retheme
the whole app consistently. If the colour ever needs to change again, only
`index.css` has to change.

Specific WhatsApp details recreated:

- **Bubbles:** pale green (`brand-100`) for my own messages, white for
  theirs, with one sharp corner (`rounded-tr-none` / `rounded-tl-none`)
  instead of a fully rounded rectangle.
- **Timestamp and tick live *inside* the bubble**, bottom-right, rather than
  as a caption below it - closer to WhatsApp's actual layout than the
  previous design.
- **Chat background:** a flat warm-white tone plus a very faint repeating
  SVG doodle pattern (`.chat-background`, a small inline `data:image/svg+xml`
  - no image file to ship).
- **Composer:** the paperclip and the text field share one white pill; Send
  is a separate circular green button - matching WhatsApp's actual composer
  shape, rather than the previous row of square icon buttons.
- **Sidebar:** my avatar and name moved from a footer to a top bar (with log
  out as a small icon on the right), and the three tabs became green pill
  buttons - the same top-bar-plus-tabs layout WhatsApp Web uses, adapted to
  this app's Chats / Requests / Add Friend tabs (which have no WhatsApp
  equivalent, since WhatsApp does not have a friend-request system).

**Deliberately not changed:** dark mode was explicitly requested to stay out
of scope for this phase - the app remains light-only. Adding it later would
mean giving every one of these colours a dark-mode counterpart via
`@media (prefers-color-scheme: dark)`, which is real, separate work.

# Phase 14 - message actions (reply, delete, copy, forward)

## 1. Why a reply stores a snapshot, not a live link

When you reply to a message, WhatsApp shows a small quoted box above your new
message with a bit of the original text. The simplest way to build this would
be to store a *reference* to the original message (its id) and look it up
again every time the reply is displayed. That has a problem: if the original
message is later deleted, the quote would either disappear or need special
handling to still show something sensible.

Instead, the moment a reply is sent, the server takes a **snapshot**: it
copies the original message's text (or, for a photo/video/file, just what
kind of attachment it was) directly onto the new message, as a small object
called `replyTo`. From that point on, the reply's quoted preview never needs
to look the original message up again - it already has everything it needs,
frozen at the moment the reply was sent. This is also exactly what a printed
or forwarded quotation is: a copy of what was said, not a live pointer to it.

If you try to reply to a message that no longer exists (for example, someone
deleted it in the half a second between you tapping Reply and your message
actually reaching the server), the server does not fail your send - it just
sends the message without a quote. A reply failing outright over a missing
quote would be a worse experience than simply not showing one.

## 2. Two different kinds of "delete", and why they need different rules

WhatsApp actually offers two different delete operations, and it is
important to see why they cannot use the same rules:

- **"Delete for me"** only changes what *you* see. Your friend still has the
  message. Since only your own view changes, there is no reason to restrict
  who can do this, or when - you can hide any message, sent by anyone, at any
  time, purely on your own device.
- **"Delete for everyone"** actually removes the message's content from both
  people's view. Because this affects someone else's screen too, it needs
  real rules: only the person who *sent* the message can do it (otherwise
  anyone could erase messages from your side of a chat), and - at the team's
  request - only within **one hour** of sending. Without a time limit,
  someone could rewrite a conversation's history long after the fact, which
  defeats the purpose of a message history at all.

Both are implemented as what's called a **soft delete**: the message's row is
never actually removed from the database. Instead, a flag is set
(`deletedForEveryone`, or the sender's id added to a `deletedFor` list), and
every place that sends a message to a client - history, live events, sockets -
checks that flag and substitutes an empty placeholder instead of the real
content. The real text technically still exists in the database (the same way
a "soft delete" works in most real systems), but no client, ever, is shown it
once the flag is set. This is simpler and safer than trying to actually erase
specific fields from a document while leaving others (like its position in
the conversation) intact.

## 3. Keeping the chat list's preview text honest

The sidebar shows a one-line preview of each friend's most recent message
(`Conversation.lastMessage`). If someone deletes their most recent message
"for everyone", but the sidebar preview is never told, it would keep showing
the deleted text - which defeats the whole point of "delete for everyone".

So a delete checks: was the message I just deleted the one currently shown as
the preview? If yes, the server looks up whatever is now the *newest*
non-deleted message in that conversation (or decides there is none) and
recomputes the preview, then tells both connected clients about the new
preview in the same event that announces the delete. If the deleted message
was **not** the preview (an older message, buried in the history), nothing
about the preview needs to change, and the event says so by simply leaving
that part out.

**Deliberately not changed:** "delete for me" never touches this shared
preview field, even if the message you hid happens to be the newest one. The
reason is that `lastMessage` is one single field shared by both people in the
conversation - there is no "my version of the preview" and "their version".
Making "delete for me" correctly hide content from only your own preview
would need a second, per-user preview field, which is a real schema change
for a fairly small visual inconsistency (you'd briefly see old preview text
for a message you specifically chose to hide from your own view only - not a
message anyone else can see was deleted).

## 4. Why the person who deletes doesn't get their own broadcast

Both delete and forward reuse a trick already used by `message:send`: when the
server tells other people about something over a socket, it uses
`socket.to(room).emit(...)`, which reaches everyone *else* in that room but
skips the very socket that triggered it. That's normally exactly what you
want - your own tab already knows what it just did, so telling it again over
the broadcast channel would be redundant.

But this means the tab that clicked "Delete" needs *some* way to update its
own screen immediately, without waiting for an event that will never reach
it. The fix: the acknowledgement (`ack`) sent back to that specific click
carries the exact same information as the broadcast event would have. The
button's own click handler applies the update locally from the ack, and every
other connected tab (mine or my friend's) applies the identical update from
the broadcast event. Same information, two different delivery paths,
depending on whether you are the one who clicked or not.

## 5. Forwarding a file without re-uploading it

Forwarding a message that has a photo or document attached does not ask you
to upload the file again. Instead, the server creates a new `Attachment`
record that points at the exact same underlying file in GridFS (the same
`fileId`), just with a new owner (you) and a new conversation. The actual
bytes of the file are never copied or moved - only a small pointer record is
duplicated, which is instant and needs no extra storage space per forward.

One extra care point: a normal upload briefly exists "unclaimed" (uploaded,
but not yet attached to a sent message) until the send request claims it, and
anything unclaimed for over an hour is automatically deleted by a cleanup job
(Phase 11). A forwarded attachment is never in that unclaimed state even
briefly - the server creates its `Attachment` record and its `Message`
together, with the link between them already in place, so the cleanup job can
never mistake it for an abandoned upload.

## 6. Multiple decisions, made because the team asked for them directly

Two things in this phase were built specifically because the team asked for
them, rather than being implied by the original spec:

- **The one-hour limit on "delete for everyone".** Without being asked, a
  simpler version (no time limit at all) would have been just as easy to
  build - the team specifically wanted a limit, closer to how WhatsApp itself
  behaves, so it was added and is enforced entirely on the server (the
  client's own "can I delete for everyone" check is just a convenience hint
  for what buttons to show - the server checks it independently regardless of
  what the client sends).
- **Forwarding to more than one friend at once.** The simplest version of
  forward would let you pick exactly one destination per action. The team
  asked for the same multi-select WhatsApp offers, so the forward dialog is a
  checklist, and one click can send the same message to several friends in
  one request - each one checked and reported on independently, so being
  unfriended with one of them does not block the rest from receiving it.

# Phase 15 - the admin panel

## 1. "Control everything from one place" - what that actually became

The team's request for this phase was, in their own words, an admin panel
where "all the features can be added or removed" and where "whatever comes
to mind in future" could be changed without touching code again. Taken
completely literally, that is not something any system can do - nobody can
build a settings screen for a feature that does not exist yet, because
nobody knows what it will need to look like.

What was actually built is the closest real thing to that request: instead
of each on/off rule living as a hardcoded constant scattered across
different files (the way the "delete for everyone" time limit did in Phase
14, or the way the Gmail-only rule would have if built as originally
suggested), every such rule now lives as one field on one database document
- a single `Setting`, always exactly one document, read fresh by whatever
part of the app needs it. Turning a feature on or off, or changing a limit,
is now a database write the admin makes through a form, not a code change
followed by a redeploy. Adding a genuinely NEW toggle later (something the
team has not thought of yet) is still real work - one new field on the
schema, one new form control, one new place that reads it - but it is a
small, contained change to an existing system, not new architecture each
time.

## 2. Why the Gmail-only rule became a *setting*, not an *if statement*

The very first version of "block temp-mail signups" could have been a
single line: reject any email that does not end in `@gmail.com`. That would
have worked, but it would also have been exactly the kind of thing the
admin panel was requested to prevent - a rule baked into the code that
needs a new deployment to ever change.

Instead, the list of allowed domains (`gmail.com` by default) lives on the
same `Setting` document as everything else, and the admin's Settings screen
edits it directly. This solves two problems the team mentioned in the same
breath, with one mechanism: it keeps out temporary/disposable email
addresses (none of those services use a real, permanent domain like
`gmail.com`), and it means if the team later wants to also allow, say, their
college's own email domain, that is a text box in the admin panel, not a
line of code.

A maintained list of "known temp-mail providers" was considered and
rejected: such lists go stale constantly as new disposable-mail services
appear, so keeping one accurate would be ongoing work with no clear end.
Restricting to a small allowlist of real, permanent providers achieves the
same actual goal (no temp-mail signups) far more simply, and never needs
updating on its own.

## 3. One admin, promoted by a script - and why that is not a shortcut

The very first admin account cannot be created by clicking a button inside
the admin panel, for a simple reason: before anyone is an admin, there is no
admin panel to click a button inside. This is the same chicken-and-egg
problem every system with permission levels eventually has to solve once,
right at the start.

The solution is a one-line command run directly on the server,
`npm run make-admin -- <username>`, which sets a single field
(`isAdmin: true`) on an account that already exists. After that, the panel
itself is reachable normally by logging in as that account - a small shield
icon appears next to the usual "log out" button, visible only to accounts
with that flag. Promoting a SECOND admin later still goes through this same
script rather than a button inside the panel - deliberately, since letting
one admin grant admin rights to anyone else from inside the UI is a much
bigger permission decision than anything else the panel does, and keeping
it as a script means it can never happen by an accidental click.

## 4. Suspend vs. delete - two very different kinds of "remove a user"

The team asked for the ability to manage misbehaving or unwanted accounts,
and there are two genuinely different things that could mean:

- **Suspend** is reversible. The account still exists, still has its
  friends, messages and history - it just cannot log in, and any tab it
  currently has open is disconnected immediately. An admin who suspends
  someone by mistake, or wants to give a warning rather than end an account
  permanently, can undo it with one click.
- **Delete** is not reversible. The account is gone.

Because delete cannot be undone, it needed a decision about what happens to
everything that account was connected to. The choice made here mirrors a
rule this app already had from a much earlier phase: when two people
unfriend each other, their past conversation is kept, not erased, because
destroying one person's message history as a side effect of the OTHER
person's decision would not be fair to them. Deleting a user follows the
same principle - their friendships are removed (so they disappear live from
every friend's chat list, exactly the way an unfriend already does, reusing
that same live update instead of building a new one), but the conversations
and messages those friendships led to are left alone. The person who stays
keeps their own memory of the conversation; only the deleted account itself
is actually gone.

## 5. Making "suspended" mean *right now*, not *eventually*

Simply marking an account as suspended in the database would not, by
itself, stop that person from continuing to use an already-open browser
tab - their existing login session would keep working until it happened to
expire on its own (session cookies here last up to 7 days). That is a real
gap for something meant to take effect immediately, for example if an
account is actively causing a problem at the moment it gets suspended.

Two things happen together the moment an admin suspends someone. First, any
tab that account has open right now is disconnected outright - the server
tells Socket.IO to force-close every connection in that person's private
room. Second, the very next time that account tries anything at all - a
page reload, a new tab, any request - the same check that already looks for
a stale password (built in Phase 12, for a different reason) also rejects a
suspended account's session. Between the two, "suspended" reliably means the
account stops working immediately, from every angle, not just "the next
time they happen to log in fresh".

## 6. Why the admin's own user search is allowed to be different from everyone else's

A core, repeatedly-emphasised rule in this app is that an ordinary user can
only ever find someone by typing their *exact* username - never a partial
match, because a partial match would let anyone slowly browse the entire
list of accounts, which is precisely the privacy guarantee this whole
project exists to provide.

The admin panel's own search deliberately breaks that exact-match rule -
typing part of a username or email finds every account that contains it.
This is not a contradiction of the privacy rule; it is the same reasoning
applied correctly to a different situation. The exact-match rule protects
against an ORDINARY account discovering who else uses the app. The admin
panel is not reachable by an ordinary account at all - every route behind it
checks, on every single request, that the account asking has the `isAdmin`
flag set, with no partial or read-only version of that check. A tool whose
entire purpose is letting one trusted account manage every other account is
supposed to be able to search broadly; restricting it to exact-match would
make it useless for the job it exists to do, without adding any real
privacy protection, since only that one trusted account can reach it.

# Phase 16a - Remember me, confirm password, logout confirmation, error screen, delivered ticks, typing, notifications

## 1. "Remember me" - what it actually changes

A login cookie can be one of two kinds. A cookie with an expiry date (a
`maxAge`) survives closing and reopening the browser. A cookie **without** one
is a "session cookie": the browser deletes it the moment it closes. Ticking
Remember me gives a 30-day cookie; leaving it unticked gives a session cookie -
the safe default on a shared or college-lab computer, where the next person to
open the browser should not find themselves logged into your account.

The server also remembers the choice inside the login token itself (a small
`rm` flag). That matters when you change your password: the server hands this
tab a fresh cookie so it stays logged in, and it uses `rm` to give that new
cookie the same lifetime you originally chose, instead of quietly switching it.

## 2. Confirm password - deliberately browser-only

Typing a password twice only protects against a typo in something you cannot
see as you type it. The server has nothing to check - it only ever receives
the one password - so the comparison is done in the browser, before anything is
sent, and "Passwords do not match" appears straight away.

## 3. Asking before logging out

Logging out is a one-click action that is annoying to undo (you have to type
your password again), and the button sits right next to other icons. A small
"Log out?" dialog with Cancel and Log out prevents an accidental click from
costing anything. It reuses the same `Dialog` component as every other dialog,
so Escape and clicking outside it both cancel.

## 4. The error screen - two different failures

- **The server cannot be reached at all** when the page first loads. Before,
  this was treated exactly like "not logged in", so someone who WAS logged in
  but briefly offline was shown the login page. Now the app tells the two
  apart: a 401 from the server is a real answer ("not logged in"), while no
  answer at all shows "Something went wrong" with a Try again button that
  simply asks again.
- **A bug crashes the page while drawing it.** Without protection React would
  leave a blank white page. An "error boundary" - which in React must be a
  class component, there is no hook for it - catches the crash and shows the
  same friendly screen, with a button that reloads the page.

## 5. The grey double tick - "delivered, but not read"

Phase 13 deliberately had only two ticks. The team asked for WhatsApp's third
state, so it was added, using exactly the same idea as read receipts: one
small pointer per person per conversation, "everything up to this message has
reached their app", that only ever moves forward.

Who decides a message is delivered? The **server**, not the recipient's
browser:

- If the recipient is online at the moment a message is sent, the server has
  just pushed it to their open connection - so it is delivered, immediately.
- If they are offline, nothing happens yet. The moment they connect again, the
  server marks everything waiting for them as delivered and tells each sender.

Each sender's tabs then turn the single grey tick into two grey ticks, live.
The blue ticks still mean the same as before - they opened that chat.

One consistency fix came with it: a chat left open in a **minimised** tab used
to mark every arriving message as read instantly, even though nobody could see
it. Now "read" waits until the tab is actually visible - otherwise the new grey
state would have been skipped straight to blue for messages nobody had seen.

## 6. "typing..."

While you type, your browser tells the server "I'm typing" on the first
keystroke and then at most once every three seconds (not on every key), and
"I've stopped" after three quiet seconds, when you send, or when you leave the
chat. The server passes it on to the other person only - after the same two
checks as sending a message (you are in this conversation, and you are still
friends) - and never saves it, because it is only true for a few seconds.

If a "stopped" message ever goes missing (your internet drops mid-sentence),
the other person's "typing..." simply disappears on its own after six seconds.

## 7. Notifications

When a message arrives and you are not looking at that chat - another chat is
open, or the PingMe tab is hidden or minimised - the browser shows a system
notification with the sender's name and picture. Clicking it brings PingMe to
the front and opens that conversation. The browser tab's title also shows how
many unread messages are waiting, like "(3) PingMe".

Three details worth knowing:

- **Asking permission.** Browsers only allow notifications after the user
  agrees, and several browsers ignore a permission request the user did not
  directly ask for. So PingMe shows a small "Enable" offer and only opens the
  browser's permission popup when that button is clicked.
- **A tiny service worker.** Android Chrome refuses notifications created
  directly by a web page; they must go through a "service worker". PingMe's
  service worker does only this one job - no offline mode, no caching.
- **What it does not do.** Notifications arrive while PingMe is open in any tab,
  even minimised - not when the browser is fully closed. That would need "Web
  Push" (server keys, stored subscriptions, a separate push service), a
  noticeably bigger system that the team did not ask for.

---

# Phase 16b - Google sign-in, Contact info, blocking, Settings page, dark mode

## 1. "Continue with Google" - how the round trip works

Google sign-in uses the standard OAuth 2.0 "authorization code" flow. It is
four hops, and the browser only ever carries one short-lived code - never
Google's tokens or our client secret:

1. The button is a plain link to `/api/auth/google`. The server makes a random
   `state` value, puts it in a cookie, and redirects the browser to Google's
   sign-in page with our client id, the `state`, and where to come back to.
2. The person picks their Google account. Google sends the browser back to
   `/api/auth/google/callback?code=...&state=...`.
3. The server checks that the `state` in the URL matches the one in the cookie.
   This proves the sign-in was started by THIS browser - without it, an
   attacker could trick your browser into finishing a sign-in into the
   attacker's account ("login CSRF").
4. The server swaps the `code` for an access token (a server-to-server call
   that includes the client secret), asks Google who the person is (their
   id, email, name, and whether Google has verified the email), then finds or
   creates the PingMe account and sets our normal session cookie - exactly the
   same cookie a password login gives.

All of this is ordinary `fetch()` calls in `googleAuthService.js`, the same
approach as the Brevo email - no Passport, no Google library - so every line
can be read and explained.

**Which account do you get?**
- Signed in with Google before -> the same account (found by the Google id).
- A password account with the same email -> that account, now linked. Google
  has verified the email, so it is the same person; making a second account
  would split their chats.
- Otherwise -> a new account, with a username made from the email (plus a few
  random digits if taken), which they can change later from their profile.

An email Google has NOT verified is refused outright, and a suspended account
or "registration closed" (for new accounts only) are respected. Every failure
sends the browser back to `/login?error=<code>`, and the login page shows a
fixed message for each known code - never text taken from the URL, so the URL
cannot be used to put words on our page.

> **Likely question: why doesn't the Gmail-only rule apply to Google?**
> That rule exists to stop throwaway email addresses. An account that Google
> itself has verified is not a throwaway, so it would only get in the way.

> **Likely question: can a Google user log in with a password?**
> Not until they set one. Their account has no password hash, so a password
> login gives the same "Invalid credentials" as any wrong password. "Forgot
> password" sets one, since it proves they own the email.

## 2. Contact info panel

Clicking a friend's name or picture in the chat header opens a panel (beside
the chat on a wide screen, over it on a small one) with their profile, every
photo, video and document sent in this chat, and the actions below. The file
list comes from `GET /api/conversations/:id/attachments`, which - like every
message route - first checks you are in the conversation (404 otherwise), and
leaves out anything deleted for everyone or deleted/cleared for you.

## 3. Mute, clear chat and block - three different strengths

- **Mute** only stops the pop-up notifications for that chat. Messages still
  arrive and the unread badge still counts (in grey). It is stored as a list
  of who muted it on the conversation (`mutedBy`), so it follows you to your
  other devices, and it changes nothing for the other person.
- **Clear chat** hides every message in the chat from YOU only. It is exactly
  Phase 14's "delete for me", applied to all the messages in one database
  update. The other person keeps their whole history.
- **Block** is the strongest. It removes the friendship (the chat becomes
  read-only, like after an unfriend) and, from then on, neither person can
  find the other by username or send a friend request. It works in both
  directions and gives the same "No user found" as a username that does not
  exist, so being blocked can never be detected. Unblocking (from Settings)
  just removes the block - they can then find each other and send a new
  request.

Each of these asks first in a `ConfirmDialog` (except mute, which is a simple
switch and easy to undo).

## 4. The Settings page

`/settings` gathers everything about your account and this device: your
profile, email and sign-in method, blocked contacts, notifications, "Enter to
send", theme, help (a link to the project's GitHub issues) and log out.

The important design point is where it sits. Before, the socket lived inside
the chat page, so leaving the chat page would have disconnected it. Now one
`LoggedInLayout` holds the socket, all its listeners, the banners and the
toasts, and both `/` and `/settings` are drawn inside it. Moving between them
keeps the connection open: while Settings is open, messages still arrive, the
tab title still counts them, and the sender still sees "Delivered".

Some settings are saved on the **account** (theme - it should follow you to
any device), others only in **this browser** (notifications and Enter to send
- they depend on the device and keyboard you are using right now).

## 5. Dark mode - one set of colours, flipped

The obvious way to add dark mode with Tailwind is to add a `dark:` class to
every element - hundreds of changes, easy to miss one. We did not need that.
Tailwind v4 writes every colour class as a CSS variable - `bg-slate-100`
becomes `background: var(--color-slate-100)` - so `index.css` simply gives
those variables different values when `<html data-theme="dark">` is set: the
grey scale is flipped (the lightest grey becomes the darkest background, the
darkest grey the brightest text), and the status colours get dark backgrounds
with light text. Every component re-colours itself with no change to its
code.

Only pure white and black could not be flipped that way (white text on a
green button must stay white), so the places that meant "the card colour" now
use a new `bg-surface`, faint hover tints use `bg-overlay/5`, and the time in a
bubble uses `text-meta`.

**No white flash.** React takes a moment to start, so the theme is applied
first by a tiny plain script, `public/theme-init.js`, in the page's `<head>`,
from a copy of the choice kept in localStorage. Then, once we know who is
logged in, the saved account theme is applied (in case they chose it on another
device). It has to be a separate file, not inline code, because our Content
Security Policy forbids inline scripts - a protection against script injection
we did not want to weaken. "Same as device" follows the operating system, and
even switches live if the OS changes while PingMe is open.

---

# Phase 17 - visual polish (animations, micro-interactions, responsiveness)

## 1. Why CSS only, no animation library

An animation library (Framer Motion, react-spring) would let us do more -
spring physics, shared-layout transitions - but it is a whole new dependency
with its own API to learn and explain. Every effect in this phase is instead
a plain CSS `@keyframes` plus a class that uses it, all in one place
(`index.css`). That means the team can point to any animation in the app and
explain it in one or two lines, which matters far more for a viva than how
smooth a spring curve is.

## 2. One switch turns all of it off

Every animation class in `index.css` lives inside a single
`@media (prefers-reduced-motion: no-preference) { ... }` block. Someone who
has told their operating system "reduce motion" (a real accessibility
setting, not a guess) gets the *exact* same interface - nothing is missing,
nothing is broken - just without any of it sliding, fading or bouncing. This
is also why it is one shared block rather than repeating the media query on
every single class: there is exactly one place that decision is made.

> **Likely question: why not just remove the class with JavaScript when
> reduced motion is on?**
> That would need reading `matchMedia` in every component that animates, and
> keeping it in sync if the setting changes. A single CSS media query does
> the same job with no JavaScript and no component to get wrong.

## 3. New messages slide in - but only the ones that are actually new

The obvious way to animate "a message appeared" is to give every bubble an
entrance animation. The problem: opening a 40-message chat would then
animate in 40 bubbles at once, and scrolling up to load older history would
do the same - neither is a "new message", so neither should slide in.

The fix has two parts working together:

- `MessageList` remembers (in a ref, not state - it must not itself cause a
  re-render) whether the conversation's first page of history has already
  been shown. It flips from false to true right after the very first render
  finishes - so every bubble that mounts during that first render still
  sees it as false.
- Each bubble is told whether it is *currently the last message in the
  array* AND *history has already been shown*. Only a message meeting both
  conditions is "new": a live arrival is always the new last item; an older
  message loaded by scrolling up is never the last item (it lands somewhere
  above the messages already on screen).

Inside `MessageBubble` itself, that flag is captured with
`useState(() => isNew)` - a **lazy** initial state, which React only ever
runs once, at the component's first render. Since each message gets its own
permanent DOM element (`<Fragment key={m.clientId}>` in `MessageList`), a
bubble is only ever "born" once for a given message; later re-renders (a
tick turning blue) update its props but never re-run that lazy initializer,
so the slide-in can never accidentally replay.

## 4. Dialogs animate open for free

Every dialog in the app (profile, confirm-are-you-sure, contact info, the
forward picker) is the same `Dialog.jsx` wrapper around a native `<dialog>`
element. Rather than add fade-in logic to that component, `index.css` has
one rule: `dialog[open] { animation: dialog-in ...; }`. The browser treats
`showModal()` as inserting the element fresh each time, so this animation
plays every time any dialog opens, with zero JavaScript changes anywhere.
There is deliberately no matching close animation - `dialog.close()` removes
the element immediately, and delaying that just to play an exit animation
would need its own bit of JavaScript timing, which was not worth it for how
quick the fade already is.

## 5. Typing dots

`TypingDots.jsx` is three small spans, each with the same `bounce-dot`
animation but a different `animation-delay`, so they bounce in a wave
instead of together. It sits next to the existing "typing…" text (which
still does the real work for screen readers) in both the chat header and
that friend's row in the Chats list.

## 6. Responsiveness: Contact info's breakpoint

Contact info used to only sit beside the chat (instead of covering it) at
`xl` (1280px) and up. Many laptop screens are narrower than that once
window chrome and the taskbar are accounted for, so on a very common laptop
size the panel would either not fit side-by-side at all, or feel cramped
right at the edge of the breakpoint. It now goes side-by-side starting at
`lg` (1024px), narrower there (`lg:w-80`) and widening again at `xl:w-96` -
one class change, no restructuring.

---

# Phase 18 - voice notes

**Goal of this phase:** hold the mic, talk, send - and the other person sees
a little waveform they can play, speed up and scrub through, like WhatsApp.

## 1. A voice note is just an attachment

The biggest decision is what we did *not* build. A voice note is not a new
kind of message with its own route, model or socket event. It is an
**attachment** of a new `kind`, `'audio'`, sent through the exact two steps
every photo and document already uses (Phase 11): upload the file, then
`message:send` with its `attachmentId`. So everything that already worked for
files works for voice notes for free - permission checks, the atomic claim,
Range downloads, deleting, forwarding, clearing, the 1-hour cleanup of unsent
uploads. The new code is only: *recording* it (browser), *recognising* it
(server), and *drawing* it (browser).

## 2. Recording - only what the browser already has

`hooks/useVoiceRecorder.js` uses three built-in browser features, no library:

- **`getUserMedia({ audio: true })`** asks for the microphone. Browsers only
  show that prompt for something the user actually clicked, which is why
  recording starts from the mic button's click and nowhere else.
- **`MediaRecorder`** compresses the sound into a file while you talk.
  Browsers disagree on the format: Chrome/Edge make WebM, Firefox Ogg, Safari
  MP4. We try a short list in order and use the first one this browser can
  make (`MediaRecorder.isTypeSupported`). It only picks the file *name* - the
  server decides for itself what the bytes are.
- **An `AnalyserNode`** (Web Audio) lets us read the raw sound 10 times a
  second. Each reading is turned into one loudness number (root-mean-square:
  square each sample, average, square-root - the standard "how loud is this"
  measure). Those numbers draw the live bars while recording, and, squeezed
  into 48 bars scaled 0-100, become the note's saved waveform.

When recording stops - sent, cancelled, or even just leaving the chat
mid-recording - every microphone track is stopped, so the browser's red
"recording" indicator goes away. Forgetting that is a real privacy bug in many
apps, so the hook does it in one `release()` function used by every exit path,
including the component's unmount cleanup.

Two limits: under half a second is refused on the client ("too short" - almost
always a mis-tap), and at 5 minutes the note stops and sends itself.

## 3. The server checks the bytes, not the name (again)

Phase 11's rule still holds: the type comes from the file's **magic bytes**,
never from its name or the browser's claim. The tricky part is that the same
container formats hold *both* audio and video:

- **WebM**: we look inside the header for its track codecs. Opus/Vorbis and no
  video codec (VP8, VP9, AV1...) → `audio/webm`; anything else stays video.
- **MP4**: we look for the `hdlr` boxes, which name each track's type - `soun`
  for sound, `vide` for video. Sound and no video → `audio/mp4`.
- **Ogg** (new): must contain an Opus or Vorbis header. Ogg *video* (Theora) or
  anything unrecognisable is refused - we only allow what we can name.

When in doubt, a WebM or MP4 is still treated as **video**, exactly as before
this phase - so no file that used to be accepted is now labelled differently
except genuine audio. Voice notes have a 10 MB limit (5 minutes of Opus is
only about 2-3 MB) and are served `inline` so they can play in the page.

## 4. The waveform and the length - display-only, and said so

The sender's browser measured the loudness and the length, so it uploads them
as two extra form fields (`durationMs`, `waveform`) alongside the file.
The server validates them with zod (length 0-5 minutes; at most 64 bars, each
a whole number 0-100) and stores them on the Attachment - **only** if the file
really turned out to be audio; on a photo they are silently ignored.

> **Likely question: can't someone send a fake waveform or wrong length?**
> Yes - and nothing breaks if they do. These numbers only decide how the
> bubble *looks*. They cannot unlock anything, cannot make the file bigger
> or change what is played, and are strictly bounded by zod. The alternative -
> decoding every upload's audio on the server - would need a heavy library
> (like ffmpeg) for a purely cosmetic gain. The player also prefers the real
> duration from the audio itself once it has loaded.

A forwarded voice note copies both fields onto the new Attachment, so it
looks identical in the other chat.

## 5. The recording bar and swipe-to-cancel

While recording, `VoiceRecorderBar.jsx` replaces the text box: a bin button,
a pulsing red dot, the timer, the live bars, "‹ Slide to cancel" and a Send
button. Dragging the strip left uses **pointer events** (one code path for
mouse, finger and pen) with `setPointerCapture`, so the drag keeps tracking
even when the finger leaves the strip. The strip follows the finger and fades;
past 120 px it cancels, otherwise it springs back. `touch-pan-y` tells the
browser a sideways drag here is ours, not a page scroll.

Swiping is not the only way: the bin button and the Escape key do the same,
so it works with a keyboard and for people who cannot drag.

## 6. The player

`VoicePlayer.jsx` is a normal `<audio>` element with no visible controls, and
our own UI on top:

- **Play/Pause** button.
- **The waveform is the progress bar.** Bars before the playback position are
  coloured in, the rest are grey. It is a real `role="slider"`, so clicking
  seeks there, and arrow keys jump 5 seconds, Home/End go to the ends - a
  screen reader announces it as "Voice message position".
- **Speed** cycles 1× → 1.5× → 2× → 1× (`audio.playbackRate`). Browsers keep
  the voice's pitch natural when sped up, so no extra work there.
- **One at a time:** a module-level variable remembers which player is
  currently playing; starting another pauses it. It is a plain variable, not
  React state or the zustand store, because no component needs to *re-render*
  because of it - it is only ever read at the moment Play is pressed.

## 7. Contact info and previews

Contact info's shared-media list already came from
`GET /conversations/:id/attachments`; it now splits the items three ways:
photos/videos, **voice messages** (new - each with who sent it, when, and a
compact player), and documents. No server change was needed. The Chats
preview, reply quotes and the forward dialog all say "🎤 Voice message".

## 8. What it deliberately does not do

- No transcription, and no "listened to" (blue mic) state - the read receipts
  of Phase 13 already say whether the chat was opened.
- No pause-and-resume while recording - start, then send or cancel.
- Only Chromium is tested automatically (Playwright can give Chromium a
  *fake* microphone that plays a test tone, so the test records a real file
  and the server really checks it). Firefox and Safari are in the manual test
  table.

---

# Fixes after Phase 18 - the admin back arrow and phones

## 1. "Something went wrong" after leaving the Admin panel

The socket is created in `SocketProvider`'s effect, so on the very first
render of the logged-in layout `useSocket()` is still `null`. Normally
nothing needs it yet. But `/admin` is outside that layout, so coming back
mounts it afresh - while the zustand store still remembers the open chat and
its messages. `ChatWindow`'s "mark as read" effect then ran immediately and
called `socket.emit` on `null`, and the error boundary caught the crash. It
now waits (`if (!socket) return`) and has `socket` in its dependency list, so
it runs again the moment the socket exists.

> **Likely question: why did a refresh fix it?** A refresh empties the
> store, so no chat is open and the effect has nothing to do on that first
> render. That is also why it only happened "sometimes": only when a chat
> was open before going to Admin.

## 2. Phones - three CSS rules worth knowing

- **`min-w-0` on flex items.** A flex item's default minimum width is its
  content's width. So one long name or link inside the chat made the whole
  chat wider than the phone, and the part that didn't fit was cut off. `min-w-0`
  says "you may be narrower than your content" - then text wraps or
  truncates instead.
- **`wrap-anywhere`, not `break-words`.** Both let a long word break, but
  `break-words` only does it *after* the box has sized itself to the whole
  word, so the bubble still grows. `wrap-anywhere` counts those break points
  when working out the size, so the bubble stays inside the screen.
- **Transforms create layers.** The slide-in animation leaves a
  `transform` on each new message row, and any element with a transform
  gets its own stacking layer. A child's `z-index` only counts inside that
  layer, so the actions menu (inside one row) was drawn under the rows after
  it. The fix lifts the whole row while its menu is open.

Also: a touch screen has no hover, so the ⋮ actions button (which only
appeared on hover) was invisible there - it is now always shown on devices
without hover, using the `(hover: none)` media query.

---

# Phase 19 - the public home page

**Goal of this phase:** someone who opens PingMe without an account should
see what it is and why they would want it - not just a login box.

## 1. One address, two pages

`/` shows the chat to a logged-in user and the home page (`LandingPage.jsx`)
to everyone else. `App.jsx` already knew who is logged in (from
`/auth/me`), so this is just a different element for the same path -
`user ? <the chat> : <LandingPage />` - rather than a separate `/welcome`
address. `/settings` and `/admin` still send a logged-out visitor to
`/login`, because those pages only make sense with an account.

## 2. The one change outside the page: where logging out goes

Before, "log out" simply forgot the user, and `/` then redirected to
`/login` by itself. Now `/` is the home page, so forgetting the user would
leave you on the home page. `clearSession` in `AuthContext` - used both by
Log out and by the "session expired" (401) handler - therefore navigates to
`/login` explicitly.

> **Likely question: then why does a returning user with an expired session
> see the home page, not the login form?**
> Because the app cannot know they ever had an account: the session cookie
> is httpOnly, so JavaScript cannot even see that one exists, and a fresh
> visit only learns "not logged in" from `/auth/me`. To the app they are a
> new visitor. When a session ends *while the app is open*, it does know,
> and goes straight to the login form.

## 3. The chat picture is code, not a screenshot

The laptop and phone in the hero (`landing/ChatPreview.jsx`) are built from
the app's own pieces - the real `Avatar` and `TypingDots` components, the
bubble-tail classes, the doodle background, the tick colours. A screenshot
would go out of date the moment the design changed, and would stay light in
dark mode; this cannot. It is marked `aria-hidden` (a screen reader would
otherwise read out a fake conversation) and described in one hidden
sentence instead, and it contains nothing you can click or tab to.

## 4. Motion with no JavaScript

Everything that moves is CSS, in the same reduced-motion block as Phase 17:

- **Bubbles appear in turn.** Every bubble uses one animation; each sets a
  different `--delay` CSS variable in its `style`, and the animation reads
  it (`animation-delay: var(--delay)`). The ticks reuse the variable too, to
  turn blue 1.4 s after their own bubble - a tiny "read receipt" replay.
- **Fade-in on scroll** uses `animation-timeline: view()`: the animation's
  progress follows the element's position on screen instead of the clock.
  No IntersectionObserver, no scroll listener. It sits inside `@supports`,
  so a browser that does not have it just shows the cards normally.
- **Smooth jumps** for the header links (`scroll-behavior: smooth`) are
  limited to this page with `html:has(.landing-page)`, and `scroll-mt-20`
  stops a section heading from ending up under the sticky header.

## 5. Honest content

Every feature card, FAQ answer and privacy point describes something the
app really does, with its real limits (10 MB photos, 25 MB videos, 5-minute
voice notes, an hour to delete for everyone by default). The design we
worked from showed voice and video call buttons - they were left out,
because PingMe has no calls, and an e2e test fails if the page ever mentions
calls or end-to-end encryption (which PingMe does not claim either).

## 6. Small pieces worth knowing

- **Links that look like buttons.** "Get started" goes to another page, so
  it must be a link (`<a>`), not a `<button>` - screen readers and "open in
  new tab" depend on that. `buttonClass()` gives a link the exact classes
  `Button` uses; it lives in its own file because a file of React components
  should only export components (that keeps Vite's hot reload working).
- **`overflow-x-clip`, not `overflow-hidden`,** on the page: both stop the
  decorative blurred circles from making a phone scroll sideways, but
  `hidden` would also stop the header from being sticky.
- **The FAQ is `<details>` / `<summary>`** - the browser opens and closes
  it, with keyboard support, and no React state at all.
- **Open Graph tags** in `index.html` decide what a shared link shows in
  WhatsApp or Telegram.

---

# Phase 20 - the "PingMe" updates channel

**Goal of this phase:** WhatsApp has its own official "WhatsApp" chat in
everyone's list, where it announces new features. PingMe now has the same:
a pinned, read-only **"PingMe ✓"** chat, and admins post to it from the
Admin panel.

## 1. Why posts are not messages from a fake "PingMe" user

The quickest-looking way would be a real account called "PingMe" that
sends ordinary messages. But PingMe's main rule is that you can only talk to
people you found by exact username and who accepted your friend request -
and `assertFriends` guards every message. A "PingMe" account would need an
exception in search, in friend requests, in sending, in the friends list...
every exception is a place a bug could let a stranger through.

So posts live in their own small collection, **`Update`** (`text`, an
optional photo, the admin who posted). The friend system is not touched at
all.

> **Likely question: then how does it look like a normal chat?**
> The client draws it with the same pieces - an avatar, bubbles, date
> separators, the doodle background - but from its own data. The open
> "conversation" id is a fixed placeholder, `'pingme-updates'`, which can
> never be a real id (those are 24 hex characters), and the chat page shows
> the channel instead of a normal chat window when it sees it.

## 2. Unread badges with one pointer per person

Each user has one field, `updatesReadUpTo`: the id of the last post they
have read. "Unread" is simply *posts with a bigger id than that* - MongoDB
ids grow over time, so this is a single count query. Reading the channel
moves the pointer with ONE atomic update whose filter says "only if it
moves forward", so two tabs racing can never move it back. It is exactly
the idea already used for read receipts (`Conversation.lastRead`), which
makes it easy to explain: one number per person, never a flag on every post.

A brand-new account starts with no pointer, so every earlier post counts as
unread - new users discover what PingMe can do, like WhatsApp's welcome
messages.

## 3. Live, to everyone

- An admin posts → the server saves it and calls `emitToAll('update:new')`:
  every connected browser adds it, bumps the badge, includes it in the
  `(1) PingMe` tab title, and shows a notification - unless the channel is
  open in a visible tab.
- An admin deletes → `update:deleted` removes it everywhere, and the client
  asks the server again for the latest post and the unread count (the server
  is the source of truth).
- I read it on one tab → `updates:read` goes to *my own* room only, so my
  other tabs clear their badge. Nobody else is told anything.

## 4. Security, the same rules as everywhere else

- **Only admins can post or delete:** every `/api/admin/*` route runs
  `requireAuth` then `requireAdmin` **before** the upload is read, so a
  non-admin can never make the server even receive a file.
- **The photo is checked by its bytes** (JPEG, PNG, WebP or GIF only - never
  SVG, which can contain scripts), stored in GridFS, and served only to
  logged-in users.
- **The text is plain text:** React shows it as text with its line breaks,
  never as HTML.
- **The author is never sent** to users - to them every post is from PingMe.

## 5. Small pieces worth knowing

- **Optional upload:** `singleFile()` gained `{ optional: true }` - a post
  can be text only. Validation runs twice on that route: the id and admin
  checks before the file, the text after multer has parsed it.
- **Keyset paging again:** posts load 20 at a time with `_id < before`,
  exactly like chat history - never skip/offset.
- **The banner stays:** the announcement banner (Phase 15) is for urgent,
  temporary notices ("maintenance tonight"); the channel is the permanent
  news feed.
- **Testing a real admin in the browser:** the end-to-end test server (test
  code only) promotes accounts named `admin_e2e…` to admin, because the
  browser has - deliberately - no way to make itself an admin.

---

# Phase 21 - PingMe AI (Google Gemini)

**Goal of this phase:** WhatsApp has Meta AI - an assistant you can chat
with like a friend. PingMe now has **PingMe AI**: a private chat pinned at
the top of your Chats list, powered by Google's **Gemini** model. It answers
as it writes, can show how it reasoned, reads photos, PDFs and voice notes,
and you can forward it any message from a chat.

## 1. The big picture - who talks to whom

```
Browser ──REST (question + file)──▶ Express ──▶ aiService ──▶ geminiClient ──▶ Google Gemini
   ▲                                                │                               │
   └──────── socket: ai:new, ai:delta, ai:done ◀────┴──────── the answer, piece by piece
```

- The **browser never talks to Google**. It only talks to our server, like
  everything else in PingMe. The secret key (`GEMINI_API_KEY`) stays on the
  server and is never sent to the browser or written to the log.
- **One file talks to Google:** `services/geminiClient.js`. It knows the
  model names, the SDK and Google's error format. `aiService.js` (our rules)
  only hands it plain objects. Two benefits: the tests can swap that one file
  for a fake, so **no test ever calls Google**; and moving to another AI
  provider later would mean rewriting only that file.

> **Likely question: is the AI "trained" by you?**
> No. We use Google's ready-made model through its API, the same way the
> app uses Brevo for email. Our work is everything around it: who may ask,
> how often, what history it sees, streaming, files, safety, storage.

## 2. Asking a question, step by step

1. The browser shows my question at once (optimistic, like a chat message)
   and sends it with `POST /api/ai/messages` - as a form, because it may
   carry a file of up to 10 MB.
2. **Before the file is even read**, the server checks: is PingMe AI on, is
   it not already answering me, am I under today's limit? If not, the
   request is refused and the file never reaches the server's memory.
3. `aiService.ask` takes my **one "answer in progress" slot** (a `Map` in
   memory, like presence). It is taken *before* any `await`, so two requests
   at the same moment can never both get it - the second gets 409.
4. It saves **two** documents: my question, and an EMPTY answer with
   `status: 'streaming'`. It tells my tabs (`ai:new`) and replies **202
   Accepted** - "saved, the answer is on its way".
5. In the background, `writeAnswer` sends the conversation to Gemini. Every
   time more of the answer arrives, `ai:delta` goes to my room with the
   **whole answer so far**. At the end the answer is saved and `ai:done`
   carries the final copy.

> **Likely question: why REST for the question but sockets for the answer?**
> Our rule: REST for things you *send or fetch*, sockets for things that
> *happen*. A question with a 10 MB photo is an upload (REST, exactly like
> chat files). The answer happens over the next few seconds - that is what
> the socket is for, and it reaches every tab I have open.

> **Likely question: why does each `ai:delta` send the whole text, not just
> the new words?**
> If a tab misses one event (a hiccup in the connection), the next event
> still has everything, so it is correct again immediately. With "just the
> new piece" we would need offsets and repair logic. Answers are small
> (a few kB), so the extra bytes cost nothing.

## 3. How does it "remember" the conversation?

Gemini remembers **nothing** between requests. So every request carries the
conversation: the last **20 messages** from MongoDB, oldest first, in
Gemini's format - `{ role: 'user' | 'model', parts: [...] }`. Failed answers
are left out, and the list always starts with a question.

Files are sent as their real bytes (`inlineData`, base64) - but only for the
**newest 3** questions that have one, within 12 MB (Gemini accepts about
20 MB per request, and base64 makes files a third bigger). Older files
become a short note: "[The user sent a photo here. It is no longer
attached.]".

> **Likely question: why not let Google store the conversation?**
> Gemini has a way to keep history on Google's side, but then MongoDB would
> no longer be the single source of truth - "Clear chat", deleting an
> account or an admin's rules would have to be repeated at Google. Sending
> 20 messages each time is simple and keeps our database in charge.

## 4. Reasoning and "Think deeper"

Gemini can **think before it answers**. We ask for a **thought summary**
(`includeThoughts: true`): the stream then contains parts marked
`thought: true`, which we save as `reasoning` and show behind **"Show
reasoning"** - and, while it works, as "Thinking: <its current heading>".

**Think deeper** sets `thinkingLevel` to HIGH instead of LOW: slower, but
better for maths, code and planning. A simple "hi" may have no reasoning at
all - the model decides how much thinking a question needs.

## 5. Files, voice notes and pictures

- **What it can read:** JPEG, PNG and WebP photos, PDFs, text files, videos
  and **voice notes** - a voice note on its own is a question too ("reply to
  what was said in it"). The type is checked by the file's **bytes**, the
  same `detectFileType` as chat uploads. GIFs and Office files are refused,
  because Gemini cannot read them.
- **Downloads** (`/api/ai/files/:id`) are for the owner only - anyone else
  gets 404, as if it did not exist.
- **Imagine** (create or change a picture) uses a separate image model that
  is **not free**. So it is built, tested with fakes, and switched **off** by
  default - an admin can switch it on with a paid key. Even a picture that
  comes from Google is checked by its bytes before we store and serve it.

## 6. Forwarding a chat message to PingMe AI

The Forward dialog lists **PingMe AI** first. `POST /api/ai/forward` checks
that I am really in the chat the message came from (`assertParticipant` -
404 otherwise), that it is not deleted, and the admin's forwarding switch.
The message becomes my question, with a note to Gemini that it was
forwarded. A file is **not copied**: the AI message points at the same
GridFS bytes, marked `shared`, so clearing the AI chat never deletes a photo
my friend's chat still shows.

## 7. When things go wrong

| What happens | What the user sees |
|---|---|
| Gemini overloaded (503) or out of quota (429), or the stream is cut off | The server quietly tries the **fallback model**, then the main one again after 2 s. Only then: "PingMe AI is busy right now - please try again in a minute." + **Try again** |
| The question or answer is blocked by Google's safety filters | "Sorry, PingMe AI can't help with that." |
| The key is wrong | "PingMe AI isn't set up correctly. Please let the admin know." |
| I press **Stop** | The request is aborted (`AbortController`) and what had arrived is kept: "You stopped this answer." |
| The server restarts mid-answer | At startup `recoverInterrupted()` marks it failed, so Try again appears |
| A real bug in our code | Logged on the server; the user gets a polite generic message |

Every failure writes one line to the server log - which model, which HTTP
status - but never the question or the key.

> **Likely question: what did you find when you tried it for real?**
> Testing with our real key showed Gemini's free tier is often busy (503
> "high demand"), and that Google sometimes cuts a stream off half-way.
> That is why the server retries on a second model and then once more, and
> why a cut-off answer starts again instead of failing.

## 8. Limits - sharing one free key fairly

The free tier has a daily limit for the **whole app**. So:

- **One answer at a time** per user (409 if you ask again while it writes).
- **A daily limit per person** (admin-set, default 50, in any rolling 24
  hours) - and **failed answers don't count**, so a busy Gemini never costs
  you. Someone over the limit cannot even upload a file.
- A request rate limit (30 per 10 minutes) against scripts.
- Answers are capped at 8192 tokens; a cut-off answer gets a note.

## 9. Showing answers safely - our own Markdown renderer

Gemini writes **Markdown** (`**bold**`, lists, tables, code). Turning that
into HTML and inserting it with `dangerouslySetInnerHTML` would be the easy
way - and dangerous: text from the AI (or from someone tricking it) could
inject a script. `components/ai/Markdown.jsx` reads the text line by line
into blocks (paragraphs, headings, lists, tables, code, quotes), then finds
inline styles, and builds **React elements only**. React escapes all text,
so nothing can ever run. Links are made only for `http(s)` addresses, never
`javascript:`. Code blocks get a "Copy code" button.

## 10. Privacy - telling users the truth

On Gemini's free tier, Google may use what is sent to improve its products.
So the chat says plainly, at the top of every conversation: it is powered by
Google Gemini, what you send goes to Google, don't share passwords or
private details, and it can make mistakes. PingMe AI sees **nothing** from
your other chats unless you forward a message to it, and each person's AI
chat is visible only to them.

## 11. Small pieces worth knowing

- **Same message twice:** the HTTP response and a socket event can bring the
  same answer, in either order. Each copy has `updatedAt` (when the server
  saved it), and the browser keeps the newest - so a late "still streaming"
  copy can never overwrite a finished answer.
- **The pinned row** shows only while PingMe AI is available (a key on the
  server AND the admin switch on), above the "PingMe" updates row. It shows
  "thinking…" while an answer is being written.
- **Notification:** a finished answer notifies "PingMe AI" unless the chat
  is open in a visible tab - you can ask, go to another chat, and be told.
- **Clear chat** deletes my AI messages and their own files; an admin
  deleting an account does the same.
- **Testing without Google:** `npm test` replaces `geminiClient.js` with a
  fake (and a second test file fakes Google's SDK to test `geminiClient.js`
  itself); the browser tests run against `e2e/fakeGemini.js`, which answers
  in Google's own streaming format.

---

# Phase 22 - PingMe as an app, with notifications while it is closed

**Goal of this phase:** people should be able to put PingMe on their phone
like WhatsApp - an icon, full screen, no browser bar - and be told about a
new message even when PingMe is closed. We did it WITHOUT writing a second
app: PingMe is now a **Progressive Web App (PWA)**.

## 1. What a PWA is, in one paragraph

A PWA is an ordinary website that gives the browser three extra things:
a **manifest** (a small JSON "ID card": name, icons, colours, "open full
screen"), a **service worker** (a script the browser keeps running in the
background for this site), and **HTTPS**. With those, Chrome, Edge, Samsung
Internet and Safari let people install it - it then gets its own icon and
window, and appears in the phone's app list. The same code still runs in a
normal browser tab.

> **Likely question: why not a "real" Android app?**
> A native app means a second codebase (Kotlin, or React Native) that the
> team must write, test and explain, plus app-store reviews for every
> change. A PWA reuses all of PingMe - every update reaches every phone the
> moment we deploy. Big companies do the same (Twitter/X Lite, Starbucks,
> Pinterest). If we ever want it on the Play Store, Google's own tool can
> wrap this exact PWA into an APK.

## 2. The manifest and the icons

`client/public/manifest.webmanifest` says: the name is PingMe, start at `/`,
`display: standalone` (no address bar), the theme colour is our green, and
here are the icons. The icons were drawn from the logo's own SVG, in the
sizes each system needs:

| File | Why it exists |
|---|---|
| `icon-192.png`, `icon-512.png` | The normal app icon (rounded square) |
| `icon-maskable-512.png` | Android cuts icons into circles or squircles - this one is green edge to edge, with the bubble inside the middle "safe zone", so nothing gets cut off |
| `apple-touch-icon.png` (180 px) | iPhone home screen. Fully opaque, because iOS fills transparent corners with black |
| `badge-96.png` | The small white shape in an Android phone's status bar |

While doing this we noticed the browser-tab icon (`favicon.svg`) was still
the old blue from before the green redesign - it is green now.

## 3. "Install" buttons - and why the iPhone is different

Chrome decides by itself that a site can be installed and fires ONE event,
`beforeinstallprompt`. `utils/install.js` catches it (it is loaded with the
app, so the event is never missed), stops the browser's own small bar, and
keeps it. Our **Install** buttons - a one-line offer in the chat list,
Settings → App, and the home page - call its `prompt()`, which opens the
browser's real install dialog.

Apple does not support that event at all: on an iPhone the ONLY way is
Safari's Share menu → "Add to Home Screen". So on iPhones the same buttons
open a small dialog with those three steps.

## 4. The service worker - and why it caches almost nothing

`client/public/sw.js` already showed notifications (Phase 16a). It now does
three jobs:

1. show notifications - the open app's, and **push** ones while PingMe is
   closed (section 5);
2. open the right place when a notification is tapped;
3. when PingMe is opened with **no internet**, show our own "You're
   offline" page instead of the browser's error page.

For job 3 it saves exactly two files in advance: `offline.html` and the icon
on it. Nothing else - not the app's code, not messages, not the API. Many
PWAs cache everything to work offline, but then a person can be stuck on an
OLD version of the app after an update, or see stale messages. For a chat
app, "always fresh from the server" is the safer choice - and simpler to
explain. (Testing caught a real bug here: at first the worker only served
the page from its cache, not the icon, so offline the picture was broken.)

## 5. Push notifications while PingMe is closed (Web Push)

Before this phase, notifications came from the socket: no open app, no
socket, no notification. Web Push is the standard way around that:

1. When someone allows notifications, their browser creates a **push
   subscription** - an address (the "endpoint") at its maker's push service
   (Google's for Chrome, Mozilla's for Firefox, Apple's for Safari), for that
   ONE device - and PingMe saves it on our server (`POST /api/push/subscriptions`).
2. When something happens and that person has PingMe open **nowhere**, the
   server posts an **encrypted** message to that address (`web-push` does the
   encryption, and signs the request with our **VAPID** keys, which prove it
   is really our server).
3. The push service wakes the phone's PingMe service worker - even with
   PingMe closed - and it shows the notification. A tap opens PingMe at
   `/?open=<the chat>`.

What gets a push: a new or forwarded message (never for a muted chat), a
friend request, an accepted request, a finished PingMe AI answer, and a new
PingMe update post.

> **Likely question: can Google read our messages then?**
> No. Each push is encrypted with the receiving device's own public key
> (it gives us that key along with the address), so the push service only
> carries an envelope it cannot open.

> **Likely question: why only when the person is offline?**
> If PingMe is open anywhere, the open app already shows a notification
> from the socket event. Pushing too would show two. "Online" is exactly the
> presence count we already keep (Phase 5).

## 6. Keeping it safe

- **Only real push services:** a subscription's address must be `https` on
  Google's, Mozilla's, Apple's or Microsoft's push service. Otherwise anyone
  could save an address of their choosing and make OUR server send requests
  to it - an attack called SSRF.
- **Shared computers:** logging out first removes this device's
  subscription, and a subscription is stored by its address - if someone
  else logs in on the same browser, it moves to them. One person's messages
  never pop up for the next person.
- **Changed password, suspended or deleted:** every device of that account
  stops getting pushes (a stolen phone stops too). The device still logged
  in simply subscribes again.
- **Never in the way:** sending a push is fire-and-forget - it can never slow
  down or break sending a message. A subscription the browser threw away
  (the push service answers 410) is deleted.
- **Tests never send a real push:** the server tests fake `web-push`'s
  sender, and the browser tests hand a push straight to the service worker.

## 7. iPhone rules, honestly

Apple only allows push for a PingMe that is **installed** to the Home Screen
(iOS 16.4 or newer), and never shows an install button for websites. So the
Settings page tells iPhone users to install first, and every Install button
shows the Share → Add to Home Screen steps.

## 8. Small pieces worth knowing

- **Keys are settings, not code:** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`,
  made once with `npx web-push generate-vapid-keys`. Without them PingMe
  works exactly as before (notifications while open).
- **Dark mode top bar:** `theme-init.js` now also sets the phone's top-bar
  colour before React starts, so an installed app opens dark from the
  first frame.
- **Dialogs are always left-aligned** - the iPhone steps opened from the
  centred home page had inherited centred text.
- **Testing the install button without installing:** the browser test fires
  a fake `beforeinstallprompt` event and checks our button calls `prompt()`;
  Chrome's own DevTools check confirms PingMe is installable.

## 9. Fix after Phase 22: typing on a phone hid the chat header

**The bug:** on a phone, opening the keyboard made the whole screen slide up
and the chat header (the friend's photo and name) vanished.

**Why:** the chat is exactly one screen tall (`100dvh`). Phones do not make
the page shorter when the keyboard opens - by default they slide the page
up so the text box stays visible, and the top of the page goes off screen.

**The fix, in two parts:**
- One word in `index.html`'s viewport tag, `interactive-widget=resizes-content`,
  tells Android browsers to make the page shorter instead - so the whole
  chat fits above the keyboard.
- iPhone Safari ignores that, so `utils/viewport.js` watches
  `window.visualViewport` (the part of the page you can actually see). When
  it gets shorter than the page - the keyboard - the chat's height is set to
  exactly that visible height, and the page is put back at the top.

And because the message list gets shorter, a small hook keeps the newest
message in view if you were already at the bottom - like WhatsApp.

> **Likely question: how did you test a phone keyboard automatically?**
> A test browser cannot open a real keyboard. But all a keyboard does to the
> page is shrink `visualViewport`, so the test replaces it with one it
> controls, shrinks it to 400px, and checks the header and the text box are
> both on screen. We also checked the test FAILS without the fix.

Also, at the team's request, the announcement banner is hidden on phones
(`hidden md:block`) - on a small screen every line belongs to the chat.

## 10. Polish after Phase 22: bigger on phones

**What the team wanted:** on a phone PingMe looked small, like a website
squeezed onto a phone, not big and clear like an app.

**How one line does it:** Tailwind writes every size - text, padding,
avatars, icons, buttons - in **rem**, which means "a multiple of the page's
root text size". Browsers start that root size at 16px. So `index.css`
says: on screens narrower than 768px (where PingMe uses its phone layout),
the root size is `112.5%`, i.e. 18px. Everything measured in rem grows by
the same 18/16 ≈ 13% at once, keeping all the proportions; computers stay
at 16px and look exactly as before.

- **Why `112.5%` and not `18px`?** A percentage is "of the user's own
  setting". Someone who already chose bigger text in their browser keeps
  that, plus our 13%.
- **Doesn't a bigger root size move the 768px breakpoint?** No - media
  queries in rem are always measured in the browser's *default* size,
  never the page's own, so the phone/computer switch stays at 768px.
- **The few fixed sizes:** message times and a few labels were written in
  pixels (`text-[11px]`), which would not grow. They became the same size
  in rem (`text-[0.6875rem]` = 11px on a computer, about 12.4px on a phone).
- **Smallest phones (320px):** two things got cramped there and were fixed.
  The sidebar tabs now size to their words and never wrap, and in Settings
  the "Edit profile" button gets its own full-width row on phones instead
  of squeezing the name.

> **Likely question: how do you test "bigger"?**
> A browser test opens the same chat on a phone-sized and a computer-sized
> window, reads the actual font sizes the browser computed, and checks the
> phone's are exactly 18/16 of the computer's. It fails if the line in
> `index.css` is removed - we checked.
