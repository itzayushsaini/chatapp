# Test cases

Kept up to date at the end of every phase.

- **Automated** cases run with `npm test` (server: 207 tests) and
  `npm run test:e2e` (Playwright: 11 browser tests).
- **Manual** cases are the ones a person checks in the browser. Fill in the
  Actual and Result columns when you run them.

Last full run: 2026-09-27 - **207/207 server tests pass, lint clean in both
workspaces. Playwright e2e (11/11, from Phase 13) was not re-run this phase -
see `docs/PROGRESS.md`, Known issues.**

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

### Phase 10 - `server/tests/profile.test.js`

| ID | Case | Expected |
|---|---|---|
| A10.1 | Update display name and bio | 200 SelfUser with trimmed values; `/auth/me` shows them |
| A10.2 | Clear the bio | `bio: ''` |
| A10.3-7 | Bio > 160; empty or > 40 char display name; invalid username; operator object | 400 each |
| A10.8 | Body includes `email` / `passwordHash` | 200, email unchanged (fields stripped) |
| A10.9 | Not logged in | 401 |
| A10.10 | Change username | 200; `usernameChangeAllowedAt` ~30 days ahead; login with new name works; search finds new name, old name 404 |
| A10.11 | Username taken (any case) | 409 `Username already taken` |
| A10.12 | Second change within 30 days / after 31 days | 429 with the date / 200 |
| A10.13 | Sending my current username | Not a change; cooldown not started |
| A10.14 | Two changes at the same moment | One 200, one 429 |
| A10.15 | Upload a picture | 200, `avatarUrl` = `/api/users/:id/avatar?v=<id>`; another user loads the exact bytes, `image/png`, cached `immutable` |
| A10.16 | Search by a stranger | Shows bio and avatarUrl, never email |
| A10.17 | Replace the picture | New URL; only one file left in GridFS |
| A10.18 | Remove the picture | `avatarUrl: null`; GET 404; no files left |
| A10.19-20 | HTML named .png; a PDF | 400; nothing stored |
| A10.21 | Picture over 2 MB | 413 `File is too large` |
| A10.22 | No file attached | 400 |
| A10.23 | Load a picture without login | 401 |

### Phase 11 - `server/tests/attachments.test.js`, `server/tests/fileType.test.js`

| ID | Case | Expected |
|---|---|---|
| A11.1 | Upload a photo | 201 `{ attachment: { id, name, mimeType, size, kind, url } }` |
| A11.2-5 | PDF, DOCX, TXT, MP4 | 201 with the right `mimeType` and `kind` |
| A11.6 | Name `रिपोर्ट.pdf` | Stored and returned unchanged |
| A11.7-9 | HTML named .jpg; SVG; ZIP named .exe | 400 `This file type is not supported`; nothing stored |
| A11.10 | Photo over 10 MB | 413; nothing stored |
| A11.11 | 12 MB video / video over 25 MB | 201 / 413 |
| A11.12 | Outsider uploads into the chat | 404; nothing stored (checked before the body is read) |
| A11.13 | After unfriending | 403 |
| A11.14 | No file | 400 |
| A11.15 | No login | 401 |
| A11.16 | Both participants download a sent file | 200, identical bytes |
| A11.17 | Photo / PDF download headers | `inline` / `attachment; filename="notes.pdf"` |
| A11.18 | PDF named `evil.html` | `Content-Type: application/pdf`, downloaded (not `text/html`) |
| A11.19 | Outsider downloads a sent file | 404 `File not found` |
| A11.20 | Unsent upload | Uploader 200, the other participant 404 |
| A11.21 | `Range: bytes=4-11` | 206, `Content-Range: bytes 4-11/<size>`, exactly those bytes |
| A11.22 | Range past the end | 416, `Content-Range: bytes */<size>` |
| A11.23 | Malformed / unknown id | 400 / 404 |
| A11.24 | Cleanup of unsent uploads | Deletes the unsent one (document and bytes), keeps the sent one |
| A11.25 | Cleanup with default age | A fresh unsent upload is kept |
| A11.26-37 | `detectFileType` recognises JPEG, PNG, GIF, WebP, MP4, MOV, WebM, PDF, DOCX, ZIP, XLS, UTF-8 TXT | Correct `{ mime, kind }` |
| A11.38-44 | `detectFileType` refuses HTML (as .jpg or .html), SVG, ZIP as .exe, binary as .txt, HEIC, empty file | `null` |
| A11.45 | PDF bytes named .html | Labelled `application/pdf` |
| A11.46-55 | `parseRange` for full, open-ended, suffix, clipped, past-the-end, reversed, empty, wrong unit and multi-range headers | Correct range or `'invalid'` |

### Phase 10 / 11 - `server/tests/socket.test.js`

| ID | Case | Expected |
|---|---|---|
| A11.56 | Send a photo with caption | Ack includes the attachment; recipient's `message:new` identical; recipient can download; history includes it |
| A11.57 | File with no text | Ack ok, `text: ''`; friends list preview `attachment: { kind: 'file', name }` |
| A11.58 | Empty text and no attachment | `Message is empty` |
| A11.59 | Same attachment for two messages | Second: `Attachment not found`; one message stored |
| A11.60 | Someone else's upload | `Attachment not found` |
| A11.61 | Upload moved to another conversation | `Attachment not found`; the other friend cannot download it |
| A11.62 | Retry with same clientId | Identical ack, one message |
| A10.24 | `user:updated` after a profile edit | Friend and pending requester get PublicUser; my other tab gets SelfUser (with email); stranger gets nothing |
| A10.25 | `user:updated` after a picture change | Contains the new `avatarUrl` |

### Phase 12 - `server/tests/password.test.js`

| ID | Case | Expected |
|---|---|---|
| A12.1 | Forgot-password for a real account | 200 generic message; one email captured (`emailService.sentEmails`) with a `/reset-password?token=...` link |
| A12.2 | Forgot-password for an unknown email | 200, the identical message; nothing sent |
| A12.3 | Forgot-password with an invalid email | 400 |
| A12.4 | Reset with the emailed link | 200; old password then fails to log in, new one works |
| A12.5 | Reusing the same reset link | First use 200, second use 400 `That reset link is invalid or has expired` |
| A12.6 | Wrong token / expired token / unknown email on reset | 400 for each |
| A12.7 | Malformed token / short new password on reset | 400 for each |
| A12.8 | Reset completes | The device that requested it is signed out too (its old cookie now gets 401) |
| A12.9 | Change password with the right current password | 200; cookie reissued (this agent stays logged in); old password then fails to log in |
| A12.10 | Change password | Every OTHER device's cookie is rejected (401) on its next request; this one still works |
| A12.11 | Wrong current password | **400** (not 401 - must never trigger the client's auto-logout), message `Current password is incorrect`, nothing changed |
| A12.12 | New password same as current | 400 |
| A12.13 | New password too short | 400 |
| A12.14 | Change password without login | 401 |

### Phase 13 - `server/tests/readReceipts.test.js`

| ID | Case | Expected |
|---|---|---|
| A13.1 | Mark read up to a real message | Ack `{ ok: true }`; the sender's socket gets `message:read { conversationId, upToMessageId }`; `Conversation.lastRead` has the reader's pointer set |
| A13.2 | `GET .../messages` after marking read | `theirReadUpTo` is null before, the message id after |
| A13.3 | Marking read again with an older or equal id | Ack `{ ok: true }`, but the sender gets **no** second `message:read` - the pointer only moves forward |
| A13.4 | An outsider (not in the conversation) tries to mark it read | Silently rejected; `lastRead` stays empty; nobody is notified |
| A13.5 | Malformed or missing payload (`null`, missing `upToMessageId`) | Acked `{ ok: false }` - never left hanging with no reply, and the socket stays connected |

### Phase 14 - `server/tests/messageActions.test.js`

| ID | Case | Expected |
|---|---|---|
| A14.1 | Reply to a real message | The saved message's `replyTo` matches a snapshot of the original (id, sender, text snippet); delivered to the other participant with the same `replyTo` |
| A14.2 | Reply to a nonexistent message id | Send still succeeds; `replyTo` is `null` (never fails the send) |
| A14.3 | "Delete for me" | Ack `{ ok: true }`; my other tab gets `message:deleted { mode: 'me' }`; the other participant's socket gets nothing; my own `GET .../messages` excludes it; theirs still includes it |
| A14.4 | "Delete for everyone" by the sender, within the window | Ack `{ ok: true }`; both participants get `message:deleted { mode: 'everyone' }`; `GET .../messages` shows `deletedForEveryone: true` and `text: ''` to both |
| A14.5 | "Delete for everyone" attempted by the non-sender | Ack `{ ok: false, error: 'You can only delete your own messages for everyone' }` |
| A14.6 | "Delete for everyone" after the 1-hour window | Ack `{ ok: false, error: 'This message is too old to delete for everyone' }` |
| A14.7 | Deleting the newest message in a conversation | The recomputed `lastMessage` (in the ack and the broadcast) points at the next-newest non-deleted message, or `null` if there is none |
| A14.8 | Delete on a conversation I am not part of | Ack `{ ok: false, error: 'Conversation not found' }` (404-style wording, not 403) |
| A14.9 | Forward a message with an attachment to another friend | Ack `results[0].ok: true`; the new message has `forwarded: true`, the same text, and a cloned attachment (same file, new id); the recipient gets `message:new` live |
| A14.10 | Forward to several conversations at once | One result per target, each independently `ok: true` |
| A14.11 | Forward where one target is not actually reachable | That target's result is `ok: false`; the other targets still succeed |
| A14.12 | Forward a message already deleted for everyone | Ack `{ ok: false, error: 'This message can no longer be forwarded' }` |
| A14.13 | Forward a message from a conversation I have no access to | Ack `{ ok: false, error: 'Conversation not found' }` |

---

## Automated - end-to-end (`npm run test:e2e`)

Files: `e2e/chat.spec.js`, `e2e/profile-attachments.spec.js`, `e2e/password.spec.js`,
`e2e/readReceipts.spec.js`. Run against the production build and server with
an in-memory database.
Forgot/reset password's email-dependent half (does the link actually work) is
covered at the server level instead - see A12.1-A12.8 - since e2e has no real
email provider configured.

| ID | Case | Expected |
|---|---|---|
| E1 | Logged-out visit to `/` and to an unknown route | Both land on `/login` |
| E2 | Full flow with two browser contexts | Register both; partial search "No user found"; exact search (any case) finds; request arrives live with toast and badge; accept; requester gets "accepted" toast; open chat shows Online; message with `<b>` renders as text and is marked Sent; unread badge on the other side; reply arrives live; after refresh still logged in with history; closing one side shows "Last seen today" |
| E3 | Logout | Back to `/login`; `/` redirects to `/login`; logging in again works |
| E4 | Edit my profile (`e2e/profile-attachments.spec.js`) | Choosing a photo saves it (footer shows it, decoded); name, bio and username saved after confirming; survives a reload; username field then locked with the date |
| E5 | Files and live profile updates, two browser contexts | Chosen photo previews from a blob: URL under the production CSP; photo with caption arrives decoded from `/api/attachments/:id`; sidebar shows "📷 Our poster"; click opens full size, Escape closes; PDF card downloads as `application/pdf` attachment; a bio edit is visible in the other person's profile view without reload |
| E6 | Forgot password request (`e2e/password.spec.js`) | "Forgot password?" link works; submitting shows the same message whatever the email; "Back to log in" returns to `/login` |
| E7 | A reset link missing its token | Shows "Invalid reset link", not a broken form |
| E8 | Change password, two browser contexts (two "devices") | Wrong current password shown inline, session NOT ended; correct current password: success message, this device stays logged in after reload, the OTHER device is redirected to `/login` on its next request, old password then fails there and the new one works |
| E9 | Change password with the wrong current password | Shown inline in the dialog: "Current password is incorrect" |
| E10 | Read receipt turns blue live (`e2e/readReceipts.spec.js`) | Sent message shows one tick while unread; the moment the other person opens the chat, the SAME tick turns into two blue ticks, with no reload |
| E11 | Read receipt when the chat is already open | A message sent while the recipient already has that chat open shows two blue ticks straight away |

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

### Phase 10 - profiles

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M10.1 | Open my profile | Click my name in the sidebar footer | "Your profile" dialog; Escape and clicking outside close it | | |
| M10.2 | Add a photo | Add photo → pick a large phone photo | Saved at once; shows as a square everywhere I appear | | |
| M10.3 | Friend sees it live | Friend has the chat open | My photo appears in their sidebar and chat header without refreshing | | |
| M10.4 | Remove photo | Remove photo | Back to initials, everywhere | | |
| M10.5 | Bio | Type 160+ characters | Stops at 160; counter shows 160 / 160; Save | | |
| M10.6 | Friend's profile | Click a friend's name in the chat header | Their photo, name, @username and bio | | |
| M10.7 | Change username | Change it, confirm the warning | Saved; login works with the new name; searching the old name gives "No user found" | | |
| M10.8 | Cooldown | Open the profile again | Username field disabled, "You can change your username again on ..." | | |
| M10.9 | Taken username | Try another account's username | "Username already taken" | | |

### Phase 11 - attachments

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M11.1 | Photo with caption | 📎 → pick a photo → type a caption → Enter | Preview above input; bubble shows progress, then the photo and caption; tick | | |
| M11.2 | Full size | Click the photo | Opens large in a dialog with Download | | |
| M11.3 | Video | Send an MP4 under 25 MB | Plays inline; seeking works (Range) | | |
| M11.4 | Document | Send a PDF / DOCX | Card with name and size; click downloads with the right name | | |
| M11.5 | Too large | Pick a 30 MB video | "Videos can be at most 25 MB", nothing uploaded | | |
| M11.6 | Wrong type | Rename a .html file to .jpg and pick it | Server refuses: "This file type is not supported" | | |
| M11.7 | Sidebar preview | After sending | "You: 📷 caption", "You: 📄 notes.pdf" | | |
| M11.8 | Privacy | Copy the photo's link, open it logged in as a third user | 404 | | |
| M11.9 | Upload failure + retry | Stop the server mid-upload, then restart and click Retry | Bubble shows "Not sent · Retry"; Retry sends it once | | |
| M11.10 | Mobile | 375 px wide | Photo fits the bubble; picker works | | |

### Phase 12 - forgot password and change password

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M12.1 | Request a reset | Login page → "Forgot password?" → enter my email → Send | "If an account exists... we've sent a link"; a real email arrives (check Brevo is configured) | | |
| M12.2 | Unknown email | Same, with an email nobody registered | The identical message; no email arrives | | |
| M12.3 | Follow the link | Click the link in the email | "Choose a new password" page, shows the right email | | |
| M12.4 | Reset it | Enter a new password twice → Reset password | Redirected to `/login` with a green "Password reset" banner | | |
| M12.5 | Old password fails, new one works | Try logging in with each | Old: "Invalid credentials". New: works | | |
| M12.6 | Reuse the link | Click the same email link again, try to reset again | "That reset link is invalid or has expired" | | |
| M12.7 | Broken link | Visit `/reset-password` with no `?token=` | "Invalid reset link", with a button to request a new one | | |
| M12.8 | Change password | Profile → Change password → correct current password, matching new ones → Update password | "Password changed. Your other devices have been logged out."; still logged in | | |
| M12.9 | Wrong current password | Same, with the wrong current password | "Current password is incorrect" shown in the dialog - **not** logged out | | |
| M12.10 | Other devices signed out | Log in as the same account in a second browser first, then change the password in the first | The second browser gets sent to `/login` on its next action | | |

### Phase 13 - read receipts and the WhatsApp look

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M13.1 | Send while they have not opened the chat | Send a message | One grey tick, inside the bubble bottom-right | | |
| M13.2 | They open the chat | Friend opens the same conversation on their side | Your tick turns blue (two ticks), live, no reload | | |
| M13.3 | They already have it open | Open the chat on both sides first, then send | Tick is blue immediately, no delay | | |
| M13.4 | Reload after being read | Refresh the page that sent the message | Tick is still blue (loaded from the server, not just remembered locally) | | |
| M13.5 | Ticks are private | Log in as the recipient | No tick appears on messages you received (ticks are sender-only) | | |
| M13.6 | Overall look | Open the app | Green accent colour throughout, pale green outgoing bubbles vs white incoming, doodle-pattern chat background, pill-shaped composer with a circular send button, sidebar has a top bar (avatar + name + logout) instead of a footer | | |

### Phase 14 - reply / delete / copy / forward

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M14.1 | Reply to a message | Hover a message → Reply, type a response, send | A quoted preview bar appears above the composer with a Cancel (×); the sent bubble shows the same quote inside it | Quote bar and sent bubble both showed "You / Doing great. Are you working on the project?" correctly | Pass |
| M14.2 | Copy a message | Hover a message with text → Copy | A "Copied" toast appears; the text is on the clipboard | Clipboard write confirmed by the browser; toast observed on a later action | Pass |
| M14.3 | Delete for me | Hover any message → Delete → "Delete for me" | The message disappears from MY view only, with no gap in the timeline; the other person still sees it | Priya deleted "Sure 🔥" for herself; it vanished from her chat with no gap, while Aman still saw it normally on his side | Pass |
| M14.4 | Delete for everyone (my own recent message) | Hover my own message, sent within the last hour → Delete → "Delete for everyone" | Both dialog options appear ("Delete for everyone" and "Delete for me"); after confirming, both sides see "This message was deleted" in place of the content | Confirmed on both the aman and priya accounts | Pass |
| M14.5 | Delete options on someone else's message | Hover a message THEY sent → Delete | Only "Delete for me" is offered - no "Delete for everyone" option at all | Confirmed - dialog showed only "Delete for me" | Pass |
| M14.6 | Sidebar preview after deleting the newest message | Delete (for everyone) whatever is currently the chat's latest message | The Chats list preview updates immediately to the next most recent message, live, with no reload | Confirmed - preview went from the deleted text back to "Sure 🔥" instantly | Pass |
| M14.7 | Forward a message | Hover a message → Forward → tick one or more friends → Forward | A toast confirms; the message appears in each selected friend's chat, marked "Forwarded" | Forwarded to Rahul Singh; message appeared instantly with the "Forwarded" label and arrow icon | Pass |
| M14.8 | Forward with an attachment | Forward a message that has a photo or file attached | The attachment appears in the new chat too, without re-choosing or re-uploading the file | Not re-verified by hand this run (covered by A14.9) | |
| M14.9 | Reply then cancel | Start a reply, then click the × on the preview bar | The preview bar disappears; sending now goes back to being a plain message | Not re-verified by hand this run (implementation mirrors M14.1's Cancel button) | |

### Phase 9 - deployment

See the checklist in `docs/DEPLOY.md`, section 3.
