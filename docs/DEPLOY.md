# Deploying PingMe

The whole app runs as **one Node.js service**: it serves the API, the
Socket.IO connections and the built React files from the same address. This
guide uses:

- **MongoDB Atlas** (free M0 cluster) for the database
- **Render** (free web service) for the Node server - it supports WebSockets,
  which Socket.IO needs

Total cost: free. Time: about 20 minutes the first time.

> **Why one service?** Because the frontend and backend share one domain, the
> session cookie is first-party, and no CORS configuration is needed. See
> "Architecture rules" in `CLAUDE.md`.

---

## 0. Before you start

1. The code must be in a **GitHub repository** (Render deploys from GitHub).
2. Check it locally first, from the repo root:

   ```bash
   npm test
   npm run lint
   npm run test:e2e
   ```

   All three must pass.

3. Make sure `server/.env` is **not** in the repository (`git status` must not
   list it - `.gitignore` excludes it).

---

## 1. Create the database (MongoDB Atlas)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create a cluster** → choose the free **M0** tier → pick a region close to
   the Render region you will use (e.g. Singapore or Frankfurt) → Create.
3. **Database Access** → *Add New Database User*
   - Authentication: password
   - Username: e.g. `pingme`
   - Password: click *Autogenerate* and **copy it somewhere safe**
   - Role: *Read and write to any database*
4. **Network Access** → *Add IP Address* → *Allow access from anywhere*
   (`0.0.0.0/0`).
   Render's free tier has no fixed outgoing IP address, so Atlas cannot be
   limited to one. The database is still protected by the username and the
   long random password.
5. **Database** → *Connect* → *Drivers* → copy the connection string. It looks
   like:

   ```
   mongodb+srv://pingme:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

   - Replace `<password>` with the password from step 3.
   - Add the database name **`pingme`** after the `/`:

   ```
   mongodb+srv://pingme:YOUR_PASSWORD@cluster0.abcde.mongodb.net/pingme?retryWrites=true&w=majority
   ```

   This full string is your `MONGO_URI`. Treat it like a password.

---

## 1.5. Set up password-reset email (Brevo)

"Forgot password" needs a real email to actually arrive. This project uses
**Brevo** (free: 300 emails/day, no card needed).

1. Sign up at <https://app.brevo.com>.
2. **Left sidebar → Senders, Domains & Dedicated IPs → Senders** → *Add a
   sender* → enter your own email address → verify it by clicking the link
   Brevo emails you. This is the address PingMe's reset emails will appear to
   come **from**.
3. **Settings (top right) → SMTP & API → API Keys** → *Generate a new API
   key* → copy it. This is your `BREVO_API_KEY`. Treat it like a password.
4. Keep both values (the API key, and the sender address from step 2) for the
   next section.

Skipping this section is fine: the app still starts and forgot-password still
answers normally, it just does not actually send anything (logged on the
server as a warning).

---

## 1.6. Set up "Continue with Google" (optional)

1. Open <https://console.cloud.google.com> and create a project (e.g.
   "PingMe").
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the
   app name (PingMe), a support email and a developer email. Scopes: the
   default `openid`, `email`, `profile` are all PingMe asks for. While the app
   is in **Testing** mode, add every Google account that should be able to
   sign in under *Test users* (or click *Publish app* to open it to anyone).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs - add both:
     - `http://localhost:5173/api/auth/google/callback` (development)
     - `https://<your-render-url>/api/auth/google/callback` (production -
       exactly your `APP_URL` followed by `/api/auth/google/callback`)
4. Google shows a **Client ID** and **Client secret**. Put them in
   `server/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for local
   development, and in Render → Environment for the live site. Treat the
   secret like a password.

The redirect URI is built from `APP_URL`, so `APP_URL` must be right, or
Google answers "redirect_uri_mismatch". Skipping this section is fine: the
Google button is simply not shown.

---

## 2. Create the web service (Render)

The repository contains a `render.yaml` Blueprint, so Render configures itself.

1. Sign up at <https://render.com> with your GitHub account.
2. **New** → **Blueprint** → choose this repository → *Connect*.
3. Render reads `render.yaml` and shows one service, `pingme`. It asks for the
   values it cannot know:
   - **`MONGO_URI`** - paste the string from step 1.5 above.
   - **`BREVO_API_KEY`** and **`EMAIL_FROM_ADDRESS`** - from section 1.5. Both
     can be left blank for now if you skipped it.
   - **`APP_URL`** - leave this blank for the moment; there's a chicken-and-egg
     problem, since you only learn the real URL after the first deploy. Come
     back and set it in step 6 below.
4. Click **Apply**. The first build takes a few minutes:
   - `npm ci --include=dev` installs everything
   - `npm run build` builds the React app into `client/dist`
   - `npm start` starts the server with `NODE_ENV=production`
5. When the log shows `MongoDB connected` and `Server listening`, open the URL
   Render gives you (e.g. `https://pingme-xxxx.onrender.com`) - it's also
   shown at the top of the service's page in the Render dashboard.
6. **Go back to Environment** (left sidebar of the service) → set **`APP_URL`**
   to that exact URL (no trailing slash) → **Save Changes**. Render redeploys
   automatically. Skipping this step means password-reset emails will link to
   `localhost` instead of your live site.

What `render.yaml` sets for you:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Secure cookies, `trust proxy`, static file serving, no stack traces in errors |
| `MONGO_URI` | you paste it | Never stored in the repository |
| `JWT_SECRET` | generated by Render | A long random value, created once and kept |
| `MONGOMS_DISABLE_POSTINSTALL` | `1` | Stops the test-only in-memory MongoDB from downloading ~600 MB during the build |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` | you paste them | Password-reset email (optional - see section 1.5) |
| `EMAIL_FROM_NAME` | `PingMe` | Shown as the email's sender name |
| `APP_URL` | you paste it, after the first deploy | So reset links point at your real site, not `localhost` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | you paste them | "Continue with Google" (optional - see section 1.6) |
| `PORT` | set by Render | `config/env.js` reads it |

### Without the Blueprint (manual setup)

If you prefer to click through it: **New → Web Service**, pick the repo, then

- Runtime: **Node**
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment: add the four variables in the table above (for `JWT_SECRET`,
  generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

---

## 3. Check the deployment

Run through this list on the live URL:

| # | Check | Expected |
|---|---|---|
| 1 | Open `https://YOUR-APP.onrender.com/api/health` | `{"status":"ok"}` |
| 2 | Open the site | Redirects to `/login` |
| 3 | Register two accounts, in two different browsers (or one normal + one private window) | Both reach the chat screen |
| 4 | Search the other's exact username, send a request, accept it | Request and "accepted" toast arrive **without refreshing** |
| 5 | Send messages both ways | They appear instantly on the other side |
| 6 | Close one browser | The other shows "Last seen …" |
| 7 | Refresh the page on `/login` or `/` | The page loads (no 404) and you stay logged in |
| 8 | Browser dev tools → Application → Cookies | `token` is **HttpOnly**, **Secure**, **SameSite=Lax** |
| 9 | Profile → add a photo, edit the bio | Saved; the other browser sees it without refreshing |
| 10 | Send a photo and a PDF | Photo shows in the chat (including the preview before sending); PDF downloads |
| 11 | Open a photo's link while logged in as a third account | 404 |
| 12 | Login page → "Forgot password?" → enter a real email you registered with | Generic "we've sent a link" message; a real email arrives (only if Brevo is configured) |
| 13 | Click the emailed link, set a new password | Old password stops working, new one logs in; the link cannot be reused |
| 14 | Profile → Change password | Success message; still logged in in this browser; a second browser logged in as the same account gets signed out on its next action |

---

## 4. Things to know

- **Free-tier sleep.** Render's free service sleeps after ~15 minutes without
  traffic; the first request after that takes up to a minute while it wakes.
  Open the site a minute before a demo.
- **One instance only.** Online/offline status is kept in the server's memory,
  so do **not** scale the service to more than one instance. See "Scaling
  note" in the README for what that would require (Redis adapter + shared
  presence store).
- **Updates.** Every push to the connected branch redeploys automatically.
  Render waits for `/api/health` to answer before switching traffic, so a
  broken build never replaces a working one.
- **Files are stored in the database (GridFS)**, not on Render's disk - which
  is wiped on every deploy. Nothing extra to set up. The free Atlas M0
  cluster holds **512 MB in total** for data *and* files; check *Atlas →
  Database → Collections → uploads.chunks* to see how much files use. Unsent
  uploads are removed automatically after an hour.
- **Upload size.** Render's free instance has 512 MB of RAM; uploads (max
  25 MB each) are held in memory only while they are checked.
- **Seed data.** `npm run seed` refuses to run in production, on purpose. Demo
  users on the live site must be registered normally.
- **Logs.** Render → your service → *Logs*. Passwords, tokens and cookies are
  never logged.

---

## 5. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build log: `Invalid environment ... MONGO_URI is required` | `MONGO_URI` not set - add it under *Environment* and redeploy |
| `Failed to start server: ... bad auth` | Wrong password in `MONGO_URI`, or special characters in it not URL-encoded. Easiest: regenerate an alphanumeric password in Atlas |
| `Failed to start server: ... timed out` / `ENOTFOUND` | Atlas *Network Access* does not include `0.0.0.0/0` |
| Can log in, but chat shows "Reconnecting…" forever | Something between the browser and Render is blocking WebSockets (some college networks do). Try mobile data |
| Login seems to work but you are logged out on refresh | The site was opened over plain `http://`. In production the cookie is `Secure`, so the browser only keeps it over `https://`. Use the `https://` URL |
| Forgot-password email link points to `localhost` | `APP_URL` is not set (or wrong) on Render - set it to your real live URL and redeploy (section 2, step 6) |
| Forgot-password shows the success message, but no email ever arrives | Either `BREVO_API_KEY` / `EMAIL_FROM_ADDRESS` are not set, or `EMAIL_FROM_ADDRESS` is not a **verified** sender in Brevo - check the server logs for a warning, and check spam |
