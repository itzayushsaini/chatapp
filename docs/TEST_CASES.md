# Test cases

Kept up to date at the end of every phase.

- **Automated** cases run with `npm test` (server: 261 tests) and
  `npm run test:e2e` (Playwright: 16 browser tests).
- **Manual** cases are the ones a person checks in the browser. Fill in the
  Actual and Result columns when you run them.

Last full run: 2026-10-02 (after Phase 21 - PingMe AI) - **364/364
server tests pass, 34/34 end-to-end tests pass (E34 added afterwards, with the banner restyle), lint clean in both workspaces, `npm run build`
succeeds.** No automated test ever calls Google: `npm test` fakes
`geminiClient.js` (or Google's SDK), and the e2e server uses `e2e/fakeGemini.js`.

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

### Phase 15 - `server/tests/admin.test.js`

| ID | Case | Expected |
|---|---|---|
| A15.1 | `GET /api/settings/public` with no session at all | 200, the default settings (`registrationOpen: true`, `allowedEmailDomains: ['gmail.com']`, `announcement` disabled) |
| A15.2 | Any admin route with no session | 401 |
| A15.3 | Any admin route as a logged-in, non-admin user | 403 `{ message: 'Admins only' }` |
| A15.4 | Read then update settings as an admin | Updated fields reflected in the response; `GET /api/settings/public` immediately reflects the public subset of the change |
| A15.5 | An invalid domain or an over-long announcement | 400 |
| A15.6 | Register while `registrationOpen` is false | 403 `{ message: 'Registration is currently closed' }` |
| A15.7 | Register with an email outside `allowedEmailDomains`, then again after adding that domain | First: 400 naming the allowed list; second (after the admin adds the domain): 201 |
| A15.8 | List and search users | Total count correct; a partial, case-insensitive search on username OR email returns only the matching account(s); no `passwordHash` in the response |
| A15.9 | An admin tries to suspend or delete their own account | 400 for both |
| A15.10 | Suspend, then attempt login | 403 `{ message: 'Your account has been suspended' }`; unsuspending restores a normal login |
| A15.11 | Suspend a user with an existing REST session | Their very next `GET /api/auth/me` returns 401 |
| A15.12 | Suspend a user with an open Socket.IO connection | Their socket receives a `disconnect` event immediately (a real Socket.IO test, not just REST) |
| A15.13 | Delete a user who has an accepted friendship | 204; the `Friendship` document is gone; the shared `Conversation` still exists |
| A15.14 | Stats | `{ totalUsers, totalMessages, onlineNow }` match reality |

### Phase 16a - `server/tests/deliveryTyping.test.js`, `server/tests/auth.test.js`

| ID | Case | Expected |
|---|---|---|
| A16.1 | Log in with `rememberMe: true` / without it | `Max-Age=2592000` (30 days) / no `Max-Age` or `Expires` at all (a browser-session cookie) |
| A16.2 | A non-boolean `rememberMe` | 400 |
| A16.3 | Send while the recipient is online | The SENDING tab gets `message:delivered { conversationId, upToMessageId }`; history shows `theirDeliveredUpTo` = that id and `theirReadUpTo` still null |
| A16.4 | Send while the recipient is offline, then they connect | Nothing at send time; `message:delivered` the moment they connect |
| A16.5 | The recipient reconnects with nothing new | No second `message:delivered` (the pointer only moves forward) |
| A16.6 | The sender reconnects | Their own messages are never marked delivered to themselves |
| A16.7 | Typing | Relayed to the friend as `{ conversationId, userId, isTyping }`; NOT to my own other tab; `isTyping: false` relayed too |
| A16.8 | Typing from someone outside the conversation | Nothing relayed |
| A16.9 | Typing after an unfriend | Nothing relayed |
| A16.10 | Malformed typing payload / `null` | Ignored; the socket stays connected |

### Phase 16b - `server/tests/google.test.js`, `server/tests/chatControls.test.js`

Google's own servers are never contacted: `fetch` is replaced with a fake
that answers the token and profile requests.

| ID | Case | Expected |
|---|---|---|
| A16b.1 | `GET /api/auth/google` | 302 to accounts.google.com with our client id, redirect URI, `openid email profile` and a 32-hex `state`; the same `state` in an HttpOnly `oauth_state` cookie |
| A16b.2 | Google sign-in not configured | 302 to `/login?error=google_unavailable` |
| A16b.3 | New person | Account created (username from the email, email lowercased, `authProvider: 'google'`, `googleLinked: true`), logged in, redirect `/` |
| A16b.4 | Same person again | Same account, no second one |
| A16b.5 | Natural username taken | Gets it plus 4 digits |
| A16b.6 | Existing password account, same email | That account, now `googleLinked: true`; `authProvider` stays `password` |
| A16b.7 | Password login on a Google-only account | 401 "Invalid credentials" (same as any wrong password) |
| A16b.8 | Change password on a Google-only account | 400 pointing to "Forgot password" |
| A16b.9 | `state` does not match this browser's cookie | `google_failed`, no session cookie, no account |
| A16b.10 | Cancelled on Google's page (`error=access_denied`) | `google_failed` |
| A16b.11 | Email not verified by Google | `google_failed`, no account |
| A16b.12 | Google rejects the code | `google_failed` |
| A16b.13 | Registration closed | New Google account refused (`registration_closed`); an existing one still logs in |
| A16b.14 | Email outside the allowed domains | Accepted - the domain rule does not apply to Google |
| A16b.15 | Suspended account | `suspended` |
| A16b.16 | Block a friend | 204; friendship gone, conversation kept; BOTH sides' searches 404 "No user found"; the blocked person's friend request 404 |
| A16b.17 | Block with a pending request | The request is gone from the other side's Requests |
| A16b.18 | Blocked list / unblock | Lists PublicUser only; the blocked person's own list is empty; after unblock the search works again with `relationship: 'none'` |
| A16b.19 | Block twice | 204, one Block document |
| A16b.20 | Block myself / unknown id / bad id | 400 / 404 / 400 |
| A16b.21 | Clear chat | 204; my history empty, theirs intact; a later message still shows for me |
| A16b.22 | Clear chat - sidebar preview | My `/api/friends` preview null; theirs unchanged |
| A16b.23 | Clear chat as a stranger | 404 |
| A16b.24 | Mute / unmute | `{ muted }`; my friends row `muted: true`, theirs `false`; unmute back to `false` |
| A16b.25 | Mute with a non-boolean / as a stranger | 400 / 404 |
| A16b.26 | Shared files | Newest first, with sender and `kind`; excludes deleted-for-everyone, unsent uploads and text-only messages |
| A16b.27 | Shared files deleted for me | Not listed for me |
| A16b.28 | Shared files as a stranger | 404 |
| A16b.29 | Theme `dark` / `system` | Saved, returned in SelfUser and by `/auth/me` |
| A16b.30 | Unknown theme | 400 |

### Phase 18 - voice notes (`fileType.test.js`, `attachments.test.js`, `messageActions.test.js`)

| ID | Case | Expected |
|---|---|---|
| A18.1 | Chrome recording (WebM, Opus only) | `audio/webm`, `audio` |
| A18.2 | Firefox recording (Ogg Opus) | `audio/ogg`, `audio` |
| A18.3 | Safari recording (MP4, only a `soun` track) | `audio/mp4`, `audio` |
| A18.4 | An `.m4a` file (`M4A ` brand) | `audio/mp4`, `audio` |
| A18.5 | WebM with a `V_VP8` track / MP4 with a `vide` track | Still `video` |
| A18.6 | WebM whose tracks can't be found | Still `video` (unchanged behaviour) |
| A18.7 | Audio renamed `.mp4` | Still `audio` - the bytes decide |
| A18.8 | Ogg Theora, or Ogg with no recognisable sound | Refused |
| A18.9 | Upload a voice note with `durationMs` + `waveform` | 201, attachment includes both |
| A18.10 | Voice note without them | 201, `durationMs: null`, `waveform: null` |
| A18.11 | The same fields on a PNG | Ignored - not in the response |
| A18.12 | Length over 5 min, negative, waveform not JSON / bar over 100 / 65 bars / an object | 400 each |
| A18.13 | Voice note over 10 MB | 413, nothing stored |
| A18.14 | Download a voice note | `Content-Type: audio/webm`, `Content-Disposition: inline` |
| A18.15 | Forward a voice note | The copy keeps `durationMs` and `waveform` |

### Phase 20 - PingMe updates channel (`updates.test.js`)

| ID | Case | Expected |
|---|---|---|
| A20.1 | Post with no session / as a non-admin (with a photo attached) | 401 / 403, and no file is stored |
| A20.2 | Admin posts text (with spaces around it) | 201 `{ update: { id, text, imageUrl: null, createdAt } }`, text trimmed, no `author` field |
| A20.3 | Admin posts a JSON body `{ text }` | 201 - text-only posts need no multipart |
| A20.4 | Admin posts text + photo, and photo only | 201 each; `imageUrl` = `/api/updates/:id/image`; two files stored |
| A20.5 | Empty post (only spaces) | 400 `Write something or add a photo` |
| A20.6 | Text of 1001 characters | 400 `text: must be at most 1000 characters` |
| A20.7 | An SVG, and a PDF named photo.png | 400 `The photo must be a JPEG, PNG, WebP or GIF image`; nothing stored |
| A20.8 | List / summary with no session | 401 |
| A20.9 | 25 posts, then the page before the oldest | 20 newest, oldest → newest, `hasMore: true`; then the other 5, `hasMore: false` |
| A20.10 | `before=nope` | 400 |
| A20.11 | Another user downloads a post's photo | 200, `image/png`, `inline`, `private, max-age=31536000, immutable`, identical bytes; 401 with no session |
| A20.12 | Photo of a text-only post | 404 |
| A20.13 | New user's summary, then marking the latest read, then a new post | `{ latest, unreadCount: 2 }` → 0 → 1 |
| A20.14 | Mark read the newest, then an older post | The pointer stays at the newest - it only moves forward |
| A20.15 | Summary when nothing was ever posted | `{ latest: null, unreadCount: 0 }` |
| A20.16 | Mark read an unknown id / `{ $gt: '' }` | 404 / 400 |
| A20.17 | Admin deletes a post with a photo | 204; post and photo gone; photo URL 404; summary's latest is the previous post; deleting again 404 |
| A20.18 | Non-admin deletes | 403, the post is kept |
| A20.19 | Two connected users; admin posts, then deletes | Both get `update:new { update }`, then `update:deleted { id }` |
| A20.20 | I mark read (twice) with another user connected | My other tab gets `updates:read { upToId }` once; the other user gets nothing; the repeat sends nothing |

### Phase 21 - PingMe AI (`ai.test.js`, with `geminiClient.js` faked)

| ID | Case | Expected |
|---|---|---|
| A21.1 | Summary / ask with no session | 401 |
| A21.2 | Summary for a new user | `{ available: true, imageGeneration: false, dailyLimit: 50, usedToday: 0, latest: null }` |
| A21.3 | No API key on the server | `available: false`; asking → 503; Gemini never called |
| A21.4 | Admin switched PingMe AI off | `available: false`; asking → 503 |
| A21.5 | Ask `"  Hi PingMe AI  "` | 202 `{ question (trimmed, done), answer (empty, streaming) }`; the answer becomes `done` with the text and reasoning; Gemini got exactly that one question, the PingMe AI system instruction, LOW thinking |
| A21.6 | Two questions in a row | The second request carries question 1, answer 1, question 2 |
| A21.7 | 24 old messages, then a new question | 19 messages sent: the last 20 minus a leading answer, starting with a question |
| A21.8 | `mode: 'think'` | The question is labelled `think`; Gemini asked to think deeper |
| A21.9 | Gemini stops at the length limit | The answer is kept, with "*(The answer was cut short…)*" |
| A21.10 | Empty text and no file / 4001 characters / bad clientId / unknown mode / `{ $gt: '' }` | 400 each; Gemini never called |
| A21.11 | The same clientId twice | Same question and answer back (202); Gemini called once; 2 documents |
| A21.12 | Ask while it is still answering | 409 "still answering"; works again once done |
| A21.13 | History `limit=2`, then `before=` | Newest page oldest → newest with `hasMore: true`, then the older one with `hasMore: false` |
| A21.14 | Another user's history / summary | Empty / `latest: null` - never someone else's chat |
| A21.15 | A photo with a question | `attachment { name, mimeType: image/png, kind: image, url: /api/ai/files/:id }`; Gemini got the real bytes (`inlineData`) then the text; owner downloads it (`image/png`, inline); another user 404 |
| A21.16 | A voice note on its own (`durationMs`, `waveform`) | 202, `kind: audio` with length and waveform; sent to Gemini as `audio/webm` |
| A21.17 | A PDF and a .txt | 202; the PDF downloads (`Content-Disposition: attachment`) |
| A21.18 | A GIF, a .docx, an HTML file | 400 "PingMe AI can read…"; nothing saved |
| A21.19 | A file of 10 MB + 1 byte | 413 |
| A21.20 | Four photo questions | Only the newest 3 go in as bytes; the oldest becomes "[The user sent a photo here…]" |
| A21.21 | Stop while it is answering | 204; the answer is `stopped` with the text that had arrived; stopping again is harmless |
| A21.22 | Gemini fails: busy / blocked / config / bad_request / empty | The answer is `error` with "busy right now" / "can't help with that" / "isn't set up correctly" / "couldn't read that" / "didn't come up with an answer"; text empty |
| A21.23 | A bug in our own code | Logged; the answer says "Something went wrong…" |
| A21.24 | Try again after a failed answer | 202; the SAME answer id goes streaming → done; Gemini asked the same question |
| A21.25 | Try again with nothing failed | 400 |
| A21.26 | An answer left `streaming` (server restart) | `recoverInterrupted()` → 1; it is now `error` "…interrupted…" |
| A21.27 | Daily limit 2: three questions | Third → 429 "today's 2 PingMe AI messages"; `usedToday: 2` |
| A21.28 | Daily limit 1, the first answer failed | A second question is still allowed |
| A21.29 | An answer from 25 hours ago, limit 1 | Allowed - only the last 24 hours count |
| A21.30 | Over the limit, with a file | 429, and no file is stored |
| A21.31 | Clear chat | 204; my messages and my files are gone; another user's AI chat is untouched |
| A21.32 | Forward a friend's text message | 202, `forwarded: true`; Gemini told it was forwarded |
| A21.33 | Forward a friend's photo, then clear the AI chat | The photo is shared (downloadable from the AI chat); after clearing, the chat's own file still exists and downloads |
| A21.34 | Forward from a chat I am not in / a message deleted for everyone | 404 / 400 |
| A21.35 | Forward a .zip / with forwarding switched off | 400 / 403 |
| A21.36 | "Imagine" with the switch off (default) | 403; summary `imageGeneration: false` |
| A21.37 | "Imagine" switched on | The answer has the created picture (`image/png`, downloadable) and its text; the image model got the prompt |
| A21.38 | "Imagine" with no description / with a PDF / changing my photo | 400 / 400 / the image model gets my photo's bytes |
| A21.39 | "Imagine" on a free plan | "isn't available on this server's Gemini plan" |
| A21.40 | Admin settings | Include `aiEnabled`, `aiDailyLimit`, `aiImageGenerationEnabled`, `aiConfigured`; can be changed; limit 0 or 1001 → 400 |
| A21.41 | Admin stats, then deleting an account | `aiAnswersToday: 1`; after the delete, its AI messages and files are gone |
| A21.42 | Live events, two users connected | My tab gets `ai:new` (question + answer), two `ai:delta` (each with the WHOLE text so far), `ai:done`, then `ai:cleared` after a clear; the other user gets none |

### Phase 21 - talking to Google (`geminiClient.test.js`, Google's SDK faked)

| ID | Case | Expected |
|---|---|---|
| A21.43 | A streamed answer with a thought part | `{ text, reasoning, truncated: false }`; every update has the WHOLE text and reasoning so far |
| A21.44 | Normal vs "Think deeper" | `thinkingLevel` LOW / HIGH, `includeThoughts: true`, the system instruction passed |
| A21.45 | Main model 503 | The fallback model answers; a warning with `(503)` is logged |
| A21.46 | Main 503, fallback 429 | After the 2 s pause the main model is tried a third time and answers |
| A21.47 | Always 503 | AiError `busy` after the third try |
| A21.48 | 400 "API key not valid" / 403 / 400 other | `config` / `config` / `bad_request`, with no retry |
| A21.49 | The stream is cut off half-way | The fallback starts the answer again: updates go "Half an ans" → empty → the whole answer |
| A21.50 | A network error (no HTTP status) every time | Tried 3 times, then `busy` |
| A21.51 | `blockReason`, or finish reason SAFETY | `blocked` |
| A21.52 | Only thoughts (MAX_TOKENS) / text cut at MAX_TOKENS | `empty` / `truncated: true` |
| A21.53 | Stop (aborted signal) | The abort error is passed on as-is, not an AiError |
| A21.54 | `createImage` with a photo | The image model gets the photo then the prompt, `responseModalities: [TEXT, IMAGE]`; returns the picture and text |
| A21.55 | `createImage` on a free plan / with no picture back | `unavailable` / `no_image` |
---

## Automated - end-to-end (`npm run test:e2e`)

Files: `e2e/chat.spec.js`, `e2e/profile-attachments.spec.js`, `e2e/password.spec.js`,
`e2e/readReceipts.spec.js`, `e2e/settings.spec.js`, `e2e/pageScroll.spec.js`,
`e2e/voiceNotes.spec.js`, `e2e/adminNavigation.spec.js`, `e2e/mobileLayout.spec.js`,
`e2e/landing.spec.js`, `e2e/updates.spec.js`. Run against the production build and server with
an in-memory database.
Forgot/reset password's email-dependent half (does the link actually work) is
covered at the server level instead - see A12.1-A12.8 - since e2e has no real
email provider configured.

| ID | Case | Expected |
|---|---|---|
| E1 | Logged-out visit to `/`, to an unknown route, to `/settings` and to `/admin` | `/` and the unknown route show the public home page (Phase 19); `/settings` and `/admin` go to `/login` |
| E2 | Full flow with two browser contexts | Register both; partial search "No user found"; exact search (any case) finds; request arrives live with toast and badge; accept; requester gets "accepted" toast; open chat shows Online; message with `<b>` renders as text and is marked Delivered (the friend is online); unread badge on the other side; reply arrives live; after refresh still logged in with history; closing one side shows "Last seen today" |
| E3 | Logout | "Log out?" dialog: Cancel keeps you logged in, Log out ends it and goes to `/login`; `/` then shows the home page, not the chat; its "Log in" link leads back to a login that works |
| E4 | Edit my profile (`e2e/profile-attachments.spec.js`) | Choosing a photo saves it (footer shows it, decoded); name, bio and username saved after confirming; survives a reload; username field then locked with the date |
| E5 | Files and live profile updates, two browser contexts | Chosen photo previews from a blob: URL under the production CSP; photo with caption arrives decoded from `/api/attachments/:id`; sidebar shows "📷 Our poster"; click opens full size, Escape closes; PDF card downloads as `application/pdf` attachment; a bio edit is visible in the other person's Contact info panel without reload, which also lists the shared photo and PDF |
| E6 | Forgot password request (`e2e/password.spec.js`) | "Forgot password?" link works; submitting shows the same message whatever the email; "Back to log in" returns to `/login` |
| E7 | A reset link missing its token | Shows "Invalid reset link", not a broken form |
| E8 | Change password, two browser contexts (two "devices") | Wrong current password shown inline, session NOT ended; correct current password: success message, this device stays logged in after reload, the OTHER device's next request (a friend search on the chat page) gets a 401 and it lands on `/login` - not on the home page - old password then fails there and the new one works |
| E9 | Change password with the wrong current password | Shown inline in the dialog: "Current password is incorrect" |
| E10 | Ticks progress live (`e2e/readReceipts.spec.js`) | With the friend offline: one grey tick ("Sent"). They come back online without opening the chat: two grey ticks ("Delivered"), live. They open it: two blue ticks ("Read"), with no reload |
| E11 | Read receipt when the chat is already open | A message sent while the recipient already has that chat open shows two blue ticks straight away |
| E12 | Typing indicator | The friend sees "typing…" in the chat header while I type; it disappears once I send |
| E13 | Settings: theme and Enter to send (`e2e/settings.spec.js`) | Choosing Dark sets `data-theme="dark"`; a brand-new browser logging in as the same user is dark too (saved on the account); the Enter-to-send switch turns off; back to Light |
| E14 | Contact info, two browser contexts | Panel shows @username and "No photos or videos yet"; mute shows "Muted" on the Chats row; Clear chat empties my chat, not theirs; Block removes the friend on both sides live and the blocked person's search says "No user found"; Unblock in Settings → searchable again |
| E15 | Messages while Settings is open | The friend's message makes the tab title "(1) PingMe" and shows "Delivered" to them - the socket stayed connected |
| E16 | Failed Google sign-in | `/login?error=google_failed` shows the fixed message; no Google button when not configured |
| E17 | Switching chats never bleeds content (`e2e/chat.spec.js`) | Messages sent in chat A, then chat B; switching between them always shows the right one, never the other; the page itself never scrolls (only the message list does) - regression test for the post-16b bugfix below |
| E18 | No scroll chaining (`e2e/chat.spec.js`) | Real mouse-wheel input, hard past both the top and bottom of a long chat's message list - `window.scrollY` stays exactly 0 throughout, and the chat header never scrolls out of view |
| E19 | Page scroll still works off the chat shell (`e2e/pageScroll.spec.js`) | Register at a 400×500 viewport: the wheel scrolls the page to reach Sign up |
| E20 | Voice note end to end (`e2e/voiceNotes.spec.js`, fake microphone) | Mic shows only while the box is empty; record ≥1 s and send → "Play voice message" bubble, "🎤 Voice message" preview, Delivered; swipe the strip left → recording cancelled, still one note; the friend receives it as a voice player (so the server saw real audio), speed cycles 1× → 1.5× → 2× → 1×, Play turns into Pause; Contact info shows "Voice messages (1)" |
| E21 | Too-short voice note | Send immediately → "too short" toast, nothing sent |
| E22 | Leaving the admin panel doesn't crash (`e2e/adminNavigation.spec.js`) | With a chat open, go to Admin panel and press its back arrow, three times - the chat is still there each time, never the "Something went wrong" page (the browser is told it is an admin by rewriting `/api/auth/me`; regression test for the post-18 bugfix) |
| E23 | Fits a 320px phone (`e2e/mobileLayout.spec.js`, touch emulation) | A friend with a 38-character name and a long link with no spaces: nothing in the chat is wider than the screen and nothing is hidden sideways; the ⋮ actions button is visible without hover; the first message's menu is on top of the bubbles below it (the element under "Reply" is Reply itself) and Reply works; Settings fits too, with "Edit profile" fully on screen |
| E24 | Home page content and links (`e2e/landing.spec.js`) | Every section heading is there; nothing mentions video/voice calls or end-to-end encryption; the header's "Privacy" link jumps to that section (`#privacy`); an FAQ answer is hidden until its question is clicked; "Get started" → `/register`, whose logo returns to `/`; "Log in" → `/login` |
| E25 | Logged-in user at `/` | Still the chat, never the home page |
| E26 | Home page on a 320px phone (touch) | No element outside the decorative parts reaches past either screen edge; Sign up is fully on screen |
| E27 | Home page in dark mode | `data-theme="dark"` and the page background is the dark theme's `#0b141a` |
| E28 | Updates channel end to end (`e2e/updates.spec.js`) | The pinned "PingMe" row is there for a brand-new user with no friends. A real admin (`admin_e2e…`, promoted by the test server) posts text + a photo from Admin → Updates; the other user, already online, sees the preview and "1 unread" live and the tab title `(1) PingMe`; opening the channel shows the post and its decoded photo, "Only PingMe can send messages here", no message box; the badge and title clear and stay cleared after a reload; the admin deletes it and the row falls back to its default text live |
| E29 | Non-admin and the admin API | No Admin link; `POST /api/admin/updates` → 403 |
| E30 | PingMe AI: ask, stream, reasoning, memory (`e2e/ai.spec.js`, fake Gemini) | The "PingMe AI" row is pinned; the welcome screen and the privacy note show; a suggestion asks it; the answer shows real bold, a numbered list and a table; "Show reasoning" / "Hide reasoning"; a second question gets "I remember 2 earlier messages."; "Think deeper" is pressed and the question is labelled; after a reload the chat is still there and the row previews it; at 375 px nothing scrolls sideways |
| E31 | Stop, Try again, Clear chat | Stop keeps "Once upon…" and "You stopped this answer."; a 503 on every model shows "busy right now" and Try again then answers; Clear chat (confirmed) brings back the welcome screen, also after a reload |
| E32 | A photo, and a forwarded chat message | A photo question gets "I can see your file: image/png." and the photo shows; a friend's message forwarded to PingMe AI (Forward dialog → PingMe AI) appears labelled "Forwarded" and is answered |
| E33 | "Imagine" | Hidden by default; an admin switches "Creating pictures" on; the user sees the chip, the placeholder changes, and the created picture appears and loads; switched off again afterwards |
| E34 | Announcement banner (`e2e/announcement.spec.js`) | An admin turns it on: a logged-out visitor sees it on the login page as one status labelled "Announcement", and the logged-in admin sees it in the chat; turned off, it disappears live for the admin and after a reload for the visitor |
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
| M3.10 | Unfriend | Chat header → friend's name → Contact info → Remove friend → confirm | Friend disappears for both, live | | |
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
| M10.6 | Friend's profile | Click a friend's name in the chat header | Contact info panel: their photo, name, @username and bio | | |
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

### Phase 15 - the admin panel

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M15.1 | Bootstrap the first admin | `npm run make-admin -- aman`, then log in as aman | A shield icon appears next to Log out in the sidebar | Confirmed | Pass |
| M15.2 | A non-admin never sees the link | Log in as any other account | No shield icon; visiting `/admin` directly redirects to `/` | Not re-verified by hand this run (covered by A15.2/A15.3 and the App.jsx route logic) | |
| M15.3 | Overview tab | Click the shield icon, stay on Overview | Total users, messages sent and online-now all match reality | Showed 8 users, 18 messages, 0 online, matching the seeded/demo data | Pass |
| M15.4 | Search users | Users tab → type part of a username or email → Search | Only matching accounts shown, partial match, case-insensitive | Searching "riy" found only Priya Sharma | Pass |
| M15.5 | Suspend and unsuspend | Users tab → Suspend a friend's account → try logging in as them elsewhere | Login shows "Your account has been suspended"; Unsuspend restores it, confirmed by logging in again | Confirmed: suspending priya blocked her login with the exact message; unsuspending restored it | Pass |
| M15.6 | Delete a user | Users tab → Delete → confirm | The account and its friendships are gone; the remaining friend's Chats list updates live (no reload) | Confirmed via the automated test (A15.13); the native confirm() dialog could not be reliably driven by the browser-automation tool used this session, so the CLICK path itself should be re-checked by hand once | |
| M15.7 | Feature toggles | Settings tab → turn off Attachments/Forwarding → try to upload a file / forward a message | Both are refused with a clear message; turning them back on restores normal behaviour | Not re-verified by hand this run (server-side gates covered directly in messageService.js/attachmentService.js, exercised indirectly by existing message/attachment test suites) | |
| M15.8 | Allowed email domains | Settings tab → add a domain → try registering with it | The new domain is accepted; one outside the list is still refused, listing the current allowed domains in the error | Confirmed via curl: a `@yahoo.com` signup was rejected naming `gmail.com`; a `@gmail.com` one succeeded | Pass |
| M15.9 | Announcement banner | Settings tab → enable it, write a message → Save | The banner appears immediately at the top of the Chats page (no reload) and on the login/register pages | Confirmed - banner appeared live on the Chats page the moment "Saved." showed | Pass |
| M15.10 | Registration closed | Settings tab → turn off "New accounts can register" → visit `/register` | The form is replaced with "Registration is currently closed" | Not re-verified by hand this run (covered by A15.6 and the RegisterPage conditional render) | |

### Phase 16a - remember me, confirm password, logout, error screen, ticks, typing, notifications

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M16a.1 | Remember me ticked | Log in with it ticked, fully close the browser, reopen PingMe | Still logged in | Cookie confirmed as 30 days in a real browser | Pass |
| M16a.2 | Remember me unticked | Log in without it, fully close the browser (all windows), reopen | Logged out, back to the login page | | |
| M16a.3 | Confirm password mismatch | Register with two different passwords | "Passwords do not match", nothing sent | Confirmed | Pass |
| M16a.4 | Logout confirmation | Click Log out → Cancel, then Log out → Log out | Cancel keeps you in; the second logs you out | Confirmed (also e2e E3) | Pass |
| M16a.5 | Server unreachable | Stop the server, reload PingMe | "Something went wrong" + Try again (not the login page); Try again works once the server is back | Confirmed with the request blocked | Pass |
| M16a.6 | Grey double tick | Send to a friend who is online but has NOT opened your chat | Two grey ticks at once | Covered by e2e E10 | Pass |
| M16a.7 | Hidden tab stays grey | Friend has your chat open, then minimises their browser; send | Two GREY ticks; they turn blue only when the friend brings the tab back | | |
| M16a.8 | Typing | Type (don't send) in a chat | The friend sees "typing…" in the header and in their Chats row; it disappears ~3 s after you stop | Covered by e2e E12 | Pass |
| M16a.9 | Enable notifications | Click "Enable" in the sidebar offer, choose Allow | The offer disappears | | |
| M16a.10 | Notification arrives | With notifications on, have a friend message you while a different chat is open (or the tab is minimised) | A system notification with their name and picture; clicking it opens that chat. Tab title shows "(1) PingMe" | | |
| M16a.11 | No notification when looking | The friend messages you while their chat is open and visible | No notification | | |

### Phase 16b - Google sign-in, Contact info, blocking, Settings, dark mode

Google cases need `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set (see
`docs/DEPLOY.md`).

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M16b.1 | Google button appears | With the Google variables set, open `/login` and `/register` | "Continue with Google" under both forms | | |
| M16b.2 | New Google account | Click it, pick a Google account never used on PingMe | Back in PingMe, logged in, username from the email; Settings → Sign-in method "Google" | | |
| M16b.3 | Link to an existing account | Log out; Continue with Google using the SAME Gmail as a password account | The existing account (same friends and chats); Sign-in method "Password or Google" | | |
| M16b.4 | Cancel on Google | Click the button, then "Cancel" / back on Google's page | Back on `/login` with "Google sign-in didn't work" | Checked the message itself in the browser | |
| M16b.5 | Contact info | Click a friend's name in the chat header | Panel with photo, @username, bio, their shared photos/videos (click opens large) and documents (click downloads) | Checked in light and dark mode | Pass |
| M16b.6 | Mute | Contact info → Mute notifications on; friend messages you from another chat | No notification pop-up; bell-off icon and grey unread badge on their row | | |
| M16b.7 | Clear chat | Contact info → Clear chat → confirm | My chat is empty and the sidebar preview gone; the friend still has everything | Covered by e2e E14 | Pass |
| M16b.8 | Block | Contact info → Block → confirm | They disappear from my Chats and I from theirs, live; neither can find the other by exact username | Covered by e2e E14 | Pass |
| M16b.9 | Unblock | Settings → Privacy → Unblock | Removed from the list; they can be found and sent a new request | Covered by e2e E14 | Pass |
| M16b.10 | Settings page | Click the gear icon | Settings opens; back arrow returns to chats; a message arriving meanwhile still updates the tab title | Covered by e2e E15 | Pass |
| M16b.11 | Dark mode | Settings → Theme → Dark | Whole app dark at once (sidebar, chat, bubbles, dialogs, Settings); reload - no white flash | Checked visually | Pass |
| M16b.12 | Same as device | Choose "Same as device", switch Windows/macOS between light and dark | PingMe follows immediately | | |
| M16b.13 | Theme follows the account | Choose Dark, log in on another browser | Dark there too | Covered by e2e E13 | Pass |
| M16b.14 | Enter to send off | Settings → Chats → Enter to send off; in a chat press Enter | A new line, not a send; the Send button still sends | | |
| M16b.15 | Log out from Settings | Settings → Log out | The same "Log out?" confirmation | | |

### Phase 17 - visual polish

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M17.1 | New message slides in | Send or receive a message in an open chat | The new bubble slides/fades in from below | Checked visually (isolated server) | Pass |
| M17.2 | History does not replay | Open a chat with existing messages | The whole page of history appears at once, with no per-bubble animation | Checked visually | Pass |
| M17.3 | Older messages don't slide in | Scroll to the top of a long chat to load older messages | They appear without any entrance animation | | |
| M17.4 | Typing dots | A friend starts typing | Three dots bounce next to "typing…" in both the chat header and the Chats row | Checked visually | Pass |
| M17.5 | Dialogs animate | Open the profile dialog, a confirm dialog, and the forward dialog | Each fades and scales in | Checked visually | Pass |
| M17.6 | Reduced motion | Turn on "Reduce motion" in the OS, reload PingMe | Everything still works, just with no animation anywhere | | |
| M17.7 | Contact info at laptop width | Resize the window to ~1100-1279px wide, open Contact info | It sits beside the chat (not overlapping it) | Checked visually | Pass |
| M17.8 | Mobile layout still works | 390×844 viewport | Sidebar/chat single-view with back button all still work, animations included | Checked visually | Pass |

### Phase 18 - voice notes

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M18.1 | Record and send | Open a chat with an empty box → tap the mic → Allow the microphone → speak ~5 s → Send | The bar shows a red dot, a running timer and moving bars while you speak; a voice bubble appears with a waveform and the right length | Checked with Chromium's fake mic | |
| M18.2 | Listen on the other side | Friend opens the chat → Play | It plays your voice; the waveform fills in as it plays; the time counts | | |
| M18.3 | Speed | Tap 1× while playing | 1.5× then 2× then back to 1×, audibly faster | | |
| M18.4 | Seek | Click partway along the waveform; or focus it and press → / ← | Jumps there (±5 s with the arrows) | | |
| M18.5 | One at a time | Play one note, then another | The first one pauses | | |
| M18.6 | Other browsers | Repeat M18.1 and M18.2 in real Firefox, and Safari (Mac/iPhone) if available | Records, sends and plays across browsers (not covered by the automated tests) | | |
| M18.7 | Swipe to cancel | Start recording → drag the strip left (or press the bin, or Escape) | Recording stops, the mic light goes off, nothing is sent | Automated (E20) | Pass |
| M18.8 | Too short | Tap mic → Send straight away | "too short" toast, nothing sent | Automated (E21) | Pass |
| M18.9 | 5-minute limit | Record past 5:00 | It stops and sends by itself at 5:00 with a toast | | |
| M18.10 | Microphone blocked | Block the mic for the site → tap mic | A toast explains it; the chat still works | | |
| M18.11 | Contact info | Open the friend's Contact info | "Voice messages (n)" lists each note with who sent it and when, playable there | Checked visually | Pass |
| M18.12 | Previews and forwarding | Look at the Chats row; forward a note to another friend | "🎤 Voice message" in the preview; the forwarded copy plays with the same waveform | | |

### Phase 19 - public home page

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M19.1 | First visit | Log out (or use a private window), open `/` | The home page: headline, "Get started", "Log in", the laptop + phone chat preview | Checked visually (isolated server) | Pass |
| M19.2 | Preview comes alive | Reload and watch the preview | Bubbles appear one by one, the ticks turn blue, "typing" dots bounce, the phone gently floats | Checked visually | Pass |
| M19.3 | Header links | Click Features, How it works, Privacy, FAQ | The page glides to each section, which is not hidden under the sticky header | | |
| M19.4 | Scroll fade-in | Scroll down slowly in Chrome/Edge | Cards fade and rise in as they come on screen | Checked visually | Pass |
| M19.5 | Sign up / log in | "Get started" and the final "Create your account"; "Log in" and "I already have one" | → `/register` and → `/login`; the logo on those pages returns home | Automated (E24) | Pass |
| M19.6 | Logged in | Log in, open `/` again | The chat, not the home page | Automated (E25) | Pass |
| M19.7 | Phone | Open the home page on a real phone | Everything fits, no sideways scrolling; the header shows only Log in / Sign up | Checked at 320 / 390px | |
| M19.8 | Dark mode | Choose Dark in Settings, log out, open `/` | The home page is dark too (it uses the theme this browser remembers) | Checked visually | Pass |
| M19.9 | Reduce motion | Turn on "Reduce motion" in the OS, reload | The same page, with no animation at all | | |
| M19.10 | Link preview | Paste the live URL into WhatsApp/Telegram | Shows "PingMe - private real-time chat" and the description | | |

### Phase 20 - PingMe updates channel

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M20.1 | Pinned row | Log in (any account, even with no friends) | "PingMe ✓" is the first row in Chats | Checked visually (isolated server) | Pass |
| M20.2 | Post from the admin panel | Admin → Updates → write a text, add a photo → Post | "Posted - everyone can see it now."; it appears under Past updates | Automated (E28) | Pass |
| M20.3 | Live arrival + notification | Another user has PingMe open in a background tab with notifications allowed; admin posts | Badge on the PingMe row, `(1) PingMe` in the tab title, a "PingMe" notification; clicking it opens the channel | | |
| M20.4 | Reading clears the badge everywhere | Same user with two tabs open; open the channel in one | Both tabs' badges clear | | |
| M20.5 | Read-only | Open the channel | No message box - "Only PingMe can send messages here" | Automated (E28) | Pass |
| M20.6 | Photo full size | Click a post's photo | Opens in a dialog; Escape closes it | | |
| M20.7 | Delete | Admin deletes a post (confirm) | It disappears for everyone, live | Automated (E28) | Pass |
| M20.8 | Phone and dark mode | Open the channel on a phone, and with the Dark theme | Fits the screen, back button returns to the list; dark colours | Checked visually | Pass |

### Phase 21 - PingMe AI (needs `GEMINI_API_KEY` in `server/.env`)

| ID | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| M21.1 | Pinned row | Log in | "PingMe AI" is the first row in Chats, above "PingMe ✓" | Checked on an isolated server with the real key | Pass |
| M21.2 | A real answer | Open PingMe AI → ask "Make a 3-day study plan for DBMS, OS and DSA as a table" | "Thinking…", then the answer streams in with a real table; the row shows "thinking…" meanwhile | Real Gemini: table + reasoning, 5-25 s | Pass |
| M21.3 | Show reasoning | On an answer with reasoning, click "Show reasoning" | The thought summary opens in grey; "Hide reasoning" closes it | Real Gemini | Pass |
| M21.4 | Think deeper | Switch on "Think deeper", ask a maths or planning question | The question is labelled "Think deeper"; the answer takes longer and usually has reasoning | Real Gemini | Pass |
| M21.5 | Memory | Say "My name is Riya", then ask "What is my name?" | It answers "Riya" | | |
| M21.6 | Photo | 📎 a photo of notes or a board → "What is written here?" | It reads the photo | Real Gemini (a poster) | Pass |
| M21.7 | Voice question | With nothing typed, tap 🎤, ask a question aloud, Send | A voice bubble; the answer replies to what you said | | |
| M21.8 | PDF | 📎 a PDF → "Summarise this" | A summary of the PDF | | |
| M21.9 | Forward to PingMe AI | In a friend chat: message actions → Forward → tick PingMe AI → Forward | "Message forwarded"; in PingMe AI it is labelled Forwarded and answered | Automated (E32, fake) | Pass |
| M21.10 | Stop | Ask "Write a long story", press the square Stop button | It stops; what was written stays; "You stopped this answer." | Automated (E31, fake) | |
| M21.11 | Busy / Try again | (Happens by itself at busy times) | "PingMe AI is busy right now…" with Try again, which answers | Seen with the real key at a busy time | Pass |
| M21.12 | Copy | Click the copy icon under an answer / "Copy code" on a code block | "Copied" | | |
| M21.13 | Another tab | Have PingMe AI open in two tabs; ask in one | The other tab shows the same answer being written | | |
| M21.14 | Notification | Ask, then open a friend chat before it finishes | A "PingMe AI" notification when the answer is ready; clicking it opens PingMe AI | | |
| M21.15 | Daily limit | Admin → Settings → Messages per person per day = 2; ask 3 questions | "2 PingMe AI messages left today" etc.; the third → "You have used today's 2 PingMe AI messages…" | Automated (A21.27) | |
| M21.16 | Switched off | Admin → Settings → untick "PingMe AI chat" → Save; reload as a user | The row is gone; an open chat says "PingMe AI is turned off right now" | | |
| M21.17 | No key | Remove `GEMINI_API_KEY`, restart | The row is gone; Admin → Settings warns "This server has no GEMINI_API_KEY…" | Automated (A21.3) | |
| M21.18 | Clear chat | 🗑 in the PingMe AI header → Clear chat | Everything gone, on all your tabs; the welcome screen is back | Automated (E31, fake) | |
| M21.19 | Phone and dark mode | Open PingMe AI on a phone with the Dark theme | Fits the screen; code blocks and tables readable; wide tables scroll inside the bubble | Real Gemini, iPhone size, dark | Pass |
| M21.20 | Admin stat | Admin → Overview | "PingMe AI answers (24 h)" counts today's answers | Automated (A21.41) | |

### Phase 9 - deployment

See the checklist in `docs/DEPLOY.md`, section 3.
