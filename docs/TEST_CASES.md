# Test cases

Kept up to date at the end of every phase.

- **Automated** cases run with `npm test` (server: 88 tests) and
  `npm run test:e2e` (Playwright: 3 browser tests).
- **Manual** cases are the ones a person checks in the browser. Fill in the
  Actual and Result columns when you run them.

Last full run: 2026-09-26 - **88/88 server tests pass, 3/3 end-to-end tests
pass, lint clean.**

---

## Automated - server (`npm test`)

### Phase 1 - `server/tests/health.test.js`

| ID | Case | Expected |
|---|---|---|
| A1.1 | `GET /api/health` | 200, body is exactly `{ status: 'ok' }` |
| A1.2 | `GET /api/health` with no cookie | 200 - no authentication needed |
| A1.3 | `GET /api/does-not-exist` | 404, `{ message: 'Not found' }` |
| A1.4 | `POST /api/health` with malformed JSON | 400 with a string `message`; process does not crash |

### Phase 2 - `server/tests/auth.test.js`, `server/tests/rateLimits.test.js`

| ID | Case | Expected |
|---|---|---|
| A2.1 | Register valid user | 201, `{ user }` with lowercased username/email, `token` cookie is HttpOnly + SameSite=Lax |
| A2.2 | Register response body | Contains no `passwordHash`, no password, no token |
| A2.3 | Stored password | A bcrypt hash with cost 12 |
| A2.4 | Username taken (different case) | 409 `Username already taken` |
| A2.5 | Email already registered | 409 `Email already registered` |
| A2.6-13 | Invalid input: username too short / with space / with symbol; empty or >40 char display name; bad email; password <8 or >72 | 400 each |
| A2.14 | `username: { $gt: '' }` | 400 (NoSQL injection blocked) |
| A2.15 | Login with username | 200 + cookie |
| A2.16 | Login with email in any case | 200 |
| A2.17 | Wrong password vs unknown user | Both 401 with the identical body `Invalid credentials` |
| A2.18 | `identifier: { $ne: null }` | 400 |
| A2.19 | `GET /auth/me` logged in | 200 with my profile including email |
| A2.20 | `GET /auth/me` no cookie | 401 `Not authenticated` |
| A2.21 | `GET /auth/me` forged token | 401 |
| A2.22 | `GET /auth/me` after the user is deleted | 401 |
| A2.23 | Logout | 204, cookie cleared, `/auth/me` then returns 401 |
| A2.24 | 11 login attempts from one IP | First 10 are 401, the 11th is 429 |

### Phase 3 - `server/tests/friends.test.js`

| ID | Case | Expected |
|---|---|---|
| A3.1 | Search exact username | 200 `{ user: {id, username, displayName}, relationship: 'none' }` |
| A3.2 | Search `" PRIYA "` | Found (normalised) |
| A3.3 | Search `pri`, `riya`, `p`, `.*`, `priy.` | 404 `No user found` for every one |
| A3.4 | `username[$ne]=x` in query | 400 |
| A3.5 | Relationship values | `self`, `pending_outgoing` / `pending_incoming` (per side), `friends` |
| A3.6 | After a decline | `none` for both sides |
| A3.7 | Search without login | 401 |
| A3.8 | Send request | 201 `{ request: { id, user, createdAt } }` |
| A3.9 | Unknown username | 404 |
| A3.10 | To myself | 400 `You can't add yourself` |
| A3.11 | Send twice | 409 `Request already sent` |
| A3.12 | They already asked me | 200 `{ friend }`, one accepted document |
| A3.13 | Already friends | 409 `Already friends` |
| A3.14 | Re-send within 7 days of being declined | 429 `You can send another request later` |
| A3.15 | Re-send after 7 days | 201, same document reused |
| A3.16 | The decliner sends a request | 201 immediately, requester swapped |
| A3.17 | Crossed requests at the same instant | Exactly one Friendship document |
| A3.18 | Accept | 200 `{ friend }` item; one Conversation created |
| A3.19 | Requester tries to accept | 404 |
| A3.20 | Two accepts at once | One 200, one 404; one Conversation |
| A3.21 | Accept with an invalid id | 400 |
| A3.22 | Decline | Requester gets 404; recipient gets 204; status `declined` |
| A3.23 | Cancel | Recipient gets 404; requester gets 204; document deleted |
| A3.24 | Cancel an accepted request | 404 |
| A3.25 | Requests list | Incoming and outgoing separated, correct item shape |
| A3.26 | Friends list order | Friend with latest message first, no-message friends last, non-friends absent |
| A3.27 | Friends list privacy | No `email` or `passwordHash` anywhere |
| A3.28 | Unfriend | 204; Friendship gone; Conversation and Messages kept; gone from both lists |
| A3.29 | Unfriend a non-friend | 404 |
| A3.30 | Re-friend | Same conversationId as before |

### Phase 4 - `server/tests/conversations.test.js`

| ID | Case | Expected |
|---|---|---|
| A4.1 | 35 messages, no cursor | Latest 30, oldest first, `hasMore: true`, correct message shape |
| A4.2 | `?before=<oldest id>` | The remaining 5, `hasMore: false` |
| A4.3 | `limit=2` / `limit=51` | 2 messages + `hasMore` / 400 |
| A4.4 | Non-participant | 404 `Conversation not found` (not 403) |
| A4.5 | Conversation does not exist | 404 |
| A4.6 | Malformed id or cursor | 400 |
| A4.7 | After unfriending | History still readable (200) |

### Phase 5 - `server/tests/socket.test.js`

| ID | Case | Expected |
|---|---|---|
| A5.1 | Connect with no cookie | `connect_error: Unauthorized` |
| A5.2 | Connect with forged token | `connect_error: Unauthorized` |
| A5.3 | Connect with valid cookie | Connected |
| A5.4 | Send a message | Ack `{ ok: true, message }` (text trimmed); recipient and my second tab get `message:new`; sending tab does **not**; saved; `lastMessage` updated |
| A5.5 | Recipient offline | Saved and visible in their history |
| A5.6 | Retry with same clientId | Same message returned; one document; not delivered twice |
| A5.7 | Not a participant | Ack `Conversation not found`; nothing emitted or saved |
| A5.8 | After unfriend | Ack `You can only message friends`; nothing saved |
| A5.9-13 | Empty text; >2000 chars; bad conversation id; bad clientId; operator object as text | Ack `ok: false`; nothing saved |
| A5.14 | No ack callback; null payload | No crash; next valid send works |
| A5.15 | 11 sends in 5 s | First 10 ok, 11th `Slow down` |
| A5.16 | Presence | Friend gets `online: true`; snapshot lists online friends; on disconnect friend gets `online: false` + `lastSeen`; `lastSeen` saved |
| A5.17 | Close one of two tabs | No offline event |
| A5.18 | Stranger | Never receives presence; snapshot empty |
| A5.19 | Friend request sent over REST | Recipient socket gets `friend:request:new` with public user |
| A5.20 | Request accepted over REST | Requester gets `friend:request:accepted` (friend online) and `presence:update` |
| A5.21 | Decline | Requester gets nothing |
| A5.22 | Cancel | Recipient gets `friend:request:cancelled { requestId }` |
| A5.23 | Unfriend | Both get `friend:removed` with the other's id |

---

## Automated - end-to-end (`npm run test:e2e`)

File: `e2e/chat.spec.js`. Runs against the production build and server with an
in-memory database.

| ID | Case | Expected |
|---|---|---|
| E1 | Logged-out visit to `/` and to an unknown route | Both land on `/login` |
| E2 | Full flow with two browser contexts | Register both; partial search "No user found"; exact search (any case) finds; request arrives live with toast and badge; accept; requester gets "accepted" toast; open chat shows Online; message with `<b>` renders as text and is marked Sent; unread badge on the other side; reply arrives live; after refresh still logged in with history; closing one side shows "Last seen today" |
| E3 | Logout | Back to `/login`; `/` redirects to `/login`; logging in again works |

---

## Manual

Prerequisites: `npm install`, `server/.env` with a valid `MONGO_URI` and a
`JWT_SECRET` of 32+ characters, MongoDB running, `npm run seed`, then
`npm run dev` and open <http://localhost:5173>. For two users use two
different browsers, or one normal and one private window.

### Phase 1 - skeleton

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M1.1 | Both apps start | `npm run dev` | Server logs `MongoDB connected` and `Server listening on http://localhost:5000 [development]`; Vite prints its 5173 URL | | |
| M1.3 | API answers directly | Open <http://localhost:5000/api/health> | `{"status":"ok"}` | | |
| M1.4 | Unknown route | Open <http://localhost:5000/api/nope> | 404 `{"message":"Not found"}` | | |
| M1.5 | Bad configuration fails loudly | Set `JWT_SECRET=short`, run `npm run dev` | Exits, prints `JWT_SECRET must be at least 32 characters`, never the value. Restore afterwards | | |
| M1.6 | Graceful shutdown | Ctrl+C while running | `SIGINT received, shutting down...`, exits cleanly | | |
| M1.7 | Database unreachable | Stop MongoDB, `npm run dev` | `Failed to start server: ...` and exit | | |

### Phase 2 / 6 - authentication

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M2.1 | Register | `/register`, fill all fields, Sign up | Lands on the chat screen; footer shows my name and @username | | |
| M2.2 | Duplicate username | Register `aman` again | Red message "Username already taken" | | |
| M2.3 | Login by email | Log out, log in with `aman@example.com` | Chat screen | | |
| M2.4 | Wrong password | Log in with a wrong password | "Invalid credentials" | | |
| M2.5 | No login flash | Logged in, press F5 | Spinner, then chat - the login form never appears | | |
| M2.6 | Cookie flags | DevTools → Application → Cookies | `token` is HttpOnly, SameSite Lax | | |
| M2.7 | Token not readable | DevTools console: `document.cookie` | Does not contain `token` | | |
| M2.8 | Logout | Click the logout icon | Back at `/login`; visiting `/` redirects to `/login` | | |
| M2.9 | Unknown route | Visit `/abc` | Redirected to `/` (or `/login` if logged out) | | |

### Phase 3 / 7 - friends and sidebar

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M3.1 | Empty state | New account, Chats tab | "No friends yet", my @username, working copy button, "Add a friend" opens Add Friend | | |
| M3.2 | Partial search | Add Friend: `pri` | "No user found" | | |
| M3.3 | Exact search | Add Friend: `PRIYA` | Priya's card with "Add friend" | | |
| M3.4 | Search myself | Search own username | "This is you" | | |
| M3.5 | Request arrives live | A adds B | B sees a toast and a badge on Requests without refreshing | | |
| M3.6 | Cancel | A: card shows "Requested · Cancel", click Cancel | B's request disappears live | | |
| M3.7 | Accept | B accepts | A gets "... accepted your friend request"; both see each other in Chats | | |
| M3.8 | Decline is silent | B declines a request from C | C gets no notification; C's search shows "Add friend"; sending again gives "You can send another request later" | | |
| M3.9 | Auto-accept | A requests B, then B searches A and clicks Accept (or Add friend) | Friends immediately | | |
| M3.10 | Unfriend | Chat header → remove friend icon → OK | Friend disappears for both, live | | |
| M3.11 | API enforcement | In Postman, as a non-friend, `GET /api/conversations/<their id>/messages` | 404 | | |

### Phase 5 / 8 - chatting

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M5.1 | Real-time message | A sends to B | Appears instantly for B; A's bubble shows a tick | | |
| M5.2 | Enter vs Shift+Enter | Type, Shift+Enter, type, Enter | One message on two lines | | |
| M5.3 | HTML is text | Send `<script>alert(1)</script>` | Shown as text, no alert | | |
| M5.4 | Counter | Paste 1800+ characters | Counter appears; input stops at 2000 | | |
| M5.5 | Unread badge | B has another chat open when A sends | Badge on A's row; clears when opened | | |
| M5.6 | Online / last seen | B closes their browser | A sees "Last seen today at ..." | | |
| M5.7 | Two tabs | Open B in two tabs, close one | A still sees B online | | |
| M5.8 | Other tab sync | A has two tabs, sends from one | Message appears in A's other tab too | | |
| M5.9 | Older messages | Seeded chat (or 40+ messages), scroll to top | Older page loads, scroll position stays put | | |
| M5.10 | New messages pill | Scroll up, receive a message | "New messages" pill; clicking it scrolls down | | |
| M5.11 | Failed send + retry | Stop the server, send a message, wait 10 s, restart the server, click Retry | "Reconnecting..." banner, then "Not sent · Retry"; after Retry the message is sent and stored once only | | |
| M5.12 | Reconnect refetch | Stop the server for ~10 s, then start it again | "Reconnecting..." banner appears, then disappears; friends, requests and the open chat reload | | |
| M5.13 | Mobile layout | DevTools device mode, 375 px wide | List only; opening a chat shows chat with back button | | |
| M5.14 | Keyboard only | Tab through the app | Visible focus ring everywhere; arrow keys switch sidebar tabs | | |

### Phase 9 - deployment

See the checklist in `docs/DEPLOY.md`, section 3.
