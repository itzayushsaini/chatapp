# PingMe

A web-based, one-to-one, real-time text chat application.

B.Tech CSE 2nd Year project, COER University.

**Live demo:** <https://chatapp-xu38.onrender.com/>
> The free hosting tier sleeps after ~15 minutes of no traffic, so the first
> load after a while can take up to a minute to wake up.

## What makes it different

You cannot browse a list of everyone who has an account. To talk to someone you
search their **exact username**, send a **friend request**, and chat only once
they **accept**. Privacy is enforced on the server, not just hidden in the UI.

## Features

- Register (Gmail addresses only, by default - admin-editable) or log in with
  username or email; session in an httpOnly cookie
- Exact-username search, friend requests (accept, decline, cancel), unfriend
- Real-time one-to-one messaging with optimistic sending, retry and no duplicates
- Reply (with a quoted preview), copy, delete (for me / for everyone, within a
  time limit) and forward (to several friends at once) any message
- Read receipts: a single tick once sent, two blue ticks once they open the chat
- Online / last-seen presence, visible to friends only
- Profiles: photo, bio, display name, and username changes (once every 30 days)
- Forgot password (emailed reset link, via Brevo) and change password from
  the profile - both sign out every other logged-in device
- Attachments: photos, videos and documents, previewed before sending, with
  upload progress; every file checked by its real contents and every download
  permission-checked
- Unread badges, date separators, infinite scroll back through history
- Automatic reconnection with a "Reconnecting…" banner and state refetch
- Responsive: list and chat side by side on desktop, one at a time on mobile
- A WhatsApp-style look: green theme, pale-green message bubbles, a
  doodle-pattern chat background, and a pill-shaped composer
- An admin panel (for an account with `isAdmin: true`): live stats, user
  search with suspend/delete, and every feature toggle above - registration
  open/closed, allowed sign-up email domains, attachments, forwarding, the
  delete-for-everyone time limit, and a site-wide announcement banner - all
  editable without a code change or a redeploy

## Tech stack

| Layer | Choice |
|---|---|
| Server | Node.js, Express 5, Mongoose, Socket.IO 4, zod, multer |
| Database | MongoDB (files in GridFS) |
| Client | React 19, Vite, Tailwind CSS 4, React Router, zustand, axios |
| Auth | JWT in an httpOnly cookie, bcryptjs password hashing |
| Security | helmet, express-rate-limit, zod validation on every input |
| Tests | Vitest + Supertest + mongodb-memory-server, Playwright for end-to-end |

The repository is an npm **workspaces** monorepo with two workspaces:
`server` and `client`.

## Requirements

- Node.js 20.19 or newer (current LTS recommended)
- MongoDB running locally, or a MongoDB Atlas connection string

## Setup

```bash
npm install                        # installs both workspaces
cp server/.env.example server/.env # then fill in the values
npm run seed                       # optional: demo users and messages
npm run dev
```

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`npm run dev` starts the API on <http://localhost:5000> and the client on
<http://localhost:5173>. **Open the client URL.** Vite proxies `/api` and
`/socket.io` to the server, so the browser sees one origin and the session
cookie stays first-party - exactly as it behaves in production.

**Demo accounts** (after `npm run seed`): `aman`, `priya`, `rahul`, `sneha`,
all with the password shown by the seed command (demo users also get bios). Aman already has two friends,
a conversation with Priya and a pending request from Sneha. Open two different
browsers (or a normal and a private window) to chat as two people.

**To open the admin panel**, make one account an admin (there is no UI action
for this - it is the one thing that has to be a script, since there is no
panel yet to grant it from):

```bash
npm run make-admin -- aman
```

Then log in as that account; an admin-only icon appears next to Log out in
the sidebar.

## Commands

Run all of these from the repository root.

| Command | What it does |
|---|---|
| `npm install` | Installs both workspaces |
| `npm run dev` | Runs server and client together |
| `npm test` | Runs the server tests (Vitest, in-memory MongoDB) |
| `npm run test:e2e` | Builds the client and runs the Playwright browser tests against the production server |
| `npm run lint` | Runs ESLint on both workspaces |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Production: one Node process serves the API, the sockets and `client/dist` |
| `npm run seed` | Creates demo data (development only; refuses in production, never deletes) |
| `npm run make-admin -- <username>` | Grants `isAdmin` to an existing account - the one-off bootstrap for the very first admin |

The first `npm test` downloads a MongoDB binary (about 600 MB) for the
in-memory database; later runs use the cache. `npm run test:e2e` needs
Playwright's browser once: `npx playwright install chromium`.

## Deployment

One Node service plus MongoDB Atlas. The repository includes a Render
Blueprint (`render.yaml`); the full guide is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Architecture in one paragraph

REST (via axios) is used for data that is **fetched**: authentication, username
search, friends, requests and message history. Socket.IO is used for things that
**happen**: a new message, presence changes and friend-request events. MongoDB
is the single source of truth - sockets only notify, so the client can always
recover the correct state by refetching. Business logic lives in services, which
both the REST controllers and the socket handlers call, so a rule can never be
enforced in one path and forgotten in the other.

## Scaling note

This is a **single-instance** design. Online/offline presence is tracked in an
in-memory `Map` inside the Node process, and Socket.IO rooms are local to that
process. Running two or more instances behind a load balancer would need:

1. the **Socket.IO Redis adapter**, so an event emitted on one instance reaches
   clients connected to another, and
2. a **shared presence store** (Redis), because each instance would otherwise
   only know about its own connections.

Neither is needed for this project, which runs as one service.

## Documentation

| File | Contents |
|---|---|
| `CLAUDE.md` | The full specification this project is built against |
| `docs/PROGRESS.md` | Phase checklist, what is done, known issues |
| `docs/EXPLAINED.md` | Plain-English explanation of every phase, for the viva |
| `docs/TEST_CASES.md` | Automated and manual test cases |
| `docs/DEPLOY.md` | Step-by-step deployment (MongoDB Atlas + Render) |
| `docs/diagrams.md` | Mermaid diagrams for the report |
