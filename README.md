# CodeHarbor

A code-hosting platform: users sign up, create public or private repositories, open and manage issues, follow other users, and browse profiles with an activity heatmap. It also ships a standalone CLI (`codeharbor init/add/commit/push/pull/revert`) that simulates local version control and can sync commit snapshots to an S3 bucket.

This README documents the system's architecture and contracts so it can be understood without reading the source first.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router 7, Axios |
| Backend | Node.js (ES modules), Express 4, Mongoose 8 (MongoDB), Zod request validation |
| Auth | JWT (7-day expiry) in an httpOnly cookie + bcrypt-hashed passwords |
| CLI / VCS simulation | Node.js + yargs, AWS SDK v3 (`@aws-sdk/client-s3`) for push/pull |
| Tests | Jest + Supertest (model layer mocked) |
| Deployment | Render (API, `render.yaml`) + Vercel (frontend, `frontend/vercel.json`) |

No TypeScript.

## Repository layout

```
codeharbor/
├── package.json              # root: `npm run dev` runs both apps via concurrently
├── render.yaml               # Render blueprint for the API
├── LICENSE                   # MIT
├── backend/
│   ├── .env.example          # PORT, MONGO_URI, JWT_SECRET, CLIENT_ORIGIN, AWS/S3 vars
│   ├── package.json
│   ├── jest.config.cjs
│   ├── src/
│   │   ├── app.js                        # Express app (CORS, cookies, JSON-only body parsing, routes), exported — no listen()
│   │   ├── server.js                     # entry point: connects Mongo, starts Express
│   │   ├── cli.js                        # entry point for the `codeharbor` VCS CLI (yargs)
│   │   ├── config/
│   │   │   ├── db.js                     # mongoose.connect wrapper
│   │   │   └── s3.js                     # lazy S3 client — only constructed when push/pull actually run
│   │   ├── controllers/
│   │   │   ├── auth.controller.js        # signup / login / logout / me
│   │   │   ├── user.controller.js        # profile reads + CRUD / follow toggle
│   │   │   ├── repo.controller.js        # repository CRUD + visibility
│   │   │   └── issue.controller.js       # issue CRUD, scoped to a repository
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js        # requireAuth (hard 401) + optionalAuth (soft)
│   │   │   ├── authorize.middleware.js   # requireRepoOwner, requireSelf
│   │   │   ├── objectId.middleware.js    # 400 on malformed :id params
│   │   │   ├── validate.middleware.js    # runs a Zod schema against req.body
│   │   │   └── errorHandler.js           # notFoundHandler + central JSON error handler
│   │   ├── models/
│   │   │   ├── user.model.js
│   │   │   ├── repo.model.js
│   │   │   └── issue.model.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js            # /api/v1/auth
│   │   │   ├── user.routes.js            # /api/v1/users
│   │   │   ├── repo.routes.js            # /api/v1/repos (incl. a repo's issues)
│   │   │   └── issue.routes.js           # /api/v1/issues
│   │   ├── utils/
│   │   │   ├── ApiError.js               # Error subclass carrying an HTTP status
│   │   │   ├── asyncHandler.js           # forwards async errors to the error handler
│   │   │   └── tokens.js                 # sign/verify the session JWT, set/clear its cookie
│   │   ├── validators/                   # Zod schemas: auth, user, repo, issue
│   │   └── vcs/                          # the local git-like CLI, separate from the web API
│   │       └── init.js, add.js, commit.js, push.js, pull.js, revert.js
│   └── tests/
│       ├── setup.js                      # test env vars
│       ├── support/mockModels.js         # mocked Mongoose models + chainable query stub
│       ├── auth.test.js
│       └── repos.test.js                 # repos, issues, users: auth guard, ownership, visibility
└── frontend/
    ├── .env.example           # VITE_API_URL
    ├── vercel.json            # SPA fallback + proxies /api to the Render backend
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx, App.jsx
        ├── config/api.js       # API base URL (same-origin in production builds)
        ├── api/client.js       # shared Axios instance (withCredentials, sends the cookie)
        ├── context/AuthContext.jsx  # AuthProvider: /auth/me on load, signup/login/logout, 401 handling
        ├── context/useAuth.js  # the context object + useAuth() hook
        ├── utils/errorMessage.js    # API error -> one display line
        ├── components/
        │   ├── Navbar.jsx
        │   ├── HeatMap.jsx
        │   └── RequireAuth.jsx  # route guard: redirects to /auth when logged out
        ├── pages/
        │   ├── Login.jsx, Signup.jsx
        │   ├── Dashboard.jsx          # "/" — your repos + public repos to browse
        │   ├── CreateRepository.jsx   # "/create"
        │   ├── RepositoryDetail.jsx   # "/repo/:id" — content, issues, owner actions
        │   └── Profile.jsx            # "/profile" and "/profile/:id"
        └── styles/              # per-page CSS
```

## Architecture

### Request pipeline

`app.js` mounts each resource's router under `/api/v1/<resource>`. Routes compose middleware in a fixed order: authentication (`requireAuth`/`optionalAuth`) → id/ownership checks → `validate(schema)` → controller. Controllers are wrapped in `asyncHandler` and signal failures by throwing `ApiError(status, message)`; the central `errorHandler` turns those into `{ success: false, message, errors? }`. Anything that isn't an `ApiError` is logged and returned as a generic `500`, so internal error details never reach the client. Unknown routes get a JSON `404` from `notFoundHandler`.

Request bodies are parsed by Zod schemas in `validators/`. Validation failures return `400` with per-field messages in `errors`. Zod also strips unknown keys, so fields like `owner` or `author` can never be supplied by the client — they always come from the authenticated user.

### Authentication

Signup/login (`POST /api/v1/auth/signup`, `POST /api/v1/auth/login`) sign a JWT with `JWT_SECRET` (payload `{ id }`, 7-day expiry) and set it as a cookie named `token`:

- `httpOnly`, so page JavaScript can't read it and an XSS bug can't steal it.
- `Secure` in production (HTTPS only).
- `SameSite=Lax`, so the browser won't attach it to cross-site POSTs (see [XSS and CSRF](#xss-and-csrf)). This works because Vercel proxies `/api` to the backend, which keeps the cookie first-party.

The token is never put in a response body. `POST /api/v1/auth/logout` clears the cookie. Because the JWT is stateless, logout can't cancel a copy of the token taken earlier; it stays valid until it expires.

Login returns the same `401 "Invalid email or password"` for an unknown email and a wrong password, and compares against a dummy hash when the user doesn't exist so the two cases also take the same time.

The frontend can't read the cookie, so on load `AuthProvider` calls `GET /api/v1/auth/me` to learn who is logged in, and `RequireAuth` shows a loading state until that answers. The shared Axios instance (`api/client.js`) uses `withCredentials: true` so the browser sends the cookie. A `401` from any request clears the user, and `RequireAuth` redirects to `/auth`.

Server-side, two middleware variants guard routes:

- `requireAuth` — reads the `token` cookie and rejects with `401` if it's missing or invalid; attaches `req.userId`.
- `optionalAuth` — attaches `req.userId` when a valid token is present, but never rejects the request. Used on reads that behave differently for anonymous vs. authenticated callers (e.g. private-repo visibility) without making the whole endpoint require login.

Authorization is a separate layer on top of authentication:

- `requireRepoOwner(param)` — loads the repository named by the given route param and rejects with `403` unless `repository.owner` matches `req.userId`. Used on repo update/delete/visibility-toggle.
- `requireSelf(param)` — rejects with `403` unless the route param matches `req.userId`. Used on profile update/delete.
- Issue update/delete checks live in `issue.controller.js` (`canModifyIssue`): the caller must be either the issue's `author` or the owner of its parent repository.

Coverage across all 21 endpoints:

| Protection level | Count | Endpoints |
| --- | --- | --- |
| Public, no auth | 7 | `auth/signup`, `auth/login`, `auth/logout`, `GET users`, `GET users/:id`, `GET repos/:id/issues`, `GET issues/:id` |
| Requires login only (no ownership check) | 4 | `GET auth/me`, `PATCH users/:id/follow`, `POST repos`, `POST repos/:id/issues` |
| Ownership-based authorization (403 if not owner/self/author) | 7 | `PUT`/`DELETE users/:id`, `PUT`/`DELETE repos/:id`, `PATCH repos/:id/visibility`, `PUT`/`DELETE issues/:id` |
| Visibility-filtered reads (public/private rules) | 4 | `GET repos`, `GET repos/:id`, `GET repos/name/:name`, `GET repos/user/:userId` |

On the frontend, `<RequireAuth>` wraps the protected routes in `App.jsx` and redirects to `/auth` when no user is logged in. This is a UX guard only — the actual enforcement is the server-side middleware above.

### XSS and CSRF

Keeping the token in an httpOnly cookie instead of `localStorage` protects it from **XSS**: injected script can't read it. The trade-off is that browsers attach cookies to requests automatically, which opens the door to **CSRF**: a page on another site making the user's browser send a request to this API with their cookie. Four layers stop that:

1. **`SameSite=Lax` cookie (the main defence).** The browser only sends the cookie on cross-site requests that are top-level `GET` navigations, like clicking a link. A cross-site `POST`, `PUT`, `PATCH` or `DELETE`, whether from a form or `fetch`, arrives without it and gets `401`.
2. **No `GET` endpoint changes state.** Every write is a `POST`, `PUT`, `PATCH` or `DELETE` (logout included), so the one cross-site request that does carry the cookie can't do anything.
3. **JSON-only request bodies.** `app.js` registers `express.json()` and no form parser. An HTML form on another site can't send JSON, so a forged form post arrives with an empty body and fails validation.
4. **Credentialed CORS locked to `CLIENT_ORIGIN`.** A cross-site `fetch` with a JSON body, or with `PUT`/`PATCH`/`DELETE`, triggers a CORS preflight, and only the configured origin passes it. Other sites also can't read any response.

`*.vercel.app` is on the public suffix list, so other Vercel apps count as different sites, not the same site.

### Repositories

`POST /api/v1/repos` sets `owner` from `req.userId` (never from the request body), defaults `visibility` to `true`, and enforces repository-name uniqueness **per owner** via a compound Mongoose index (`{ owner, name }`) rather than globally; a duplicate returns `409`.

Every read path (`GET /repos`, `/repos/:id`, `/repos/name/:name`, `/repos/user/:userId`) applies the same visibility rule: a private repository is included in the response only if the requester is its owner. A private repo requested by anyone else — authenticated or not — returns `404`, the same response as a nonexistent repo.

### Issues

Issues are created and listed under their repository (`POST`/`GET /api/v1/repos/:id/issues`); creation also pushes the new issue's id into that repository's `issues` array. A single issue is addressed at `/api/v1/issues/:id`. Reading is unauthenticated; updating and deleting require the caller to be the issue's author or the repository's owner.

### Following

`PATCH /api/v1/users/:id/follow` toggles the **caller's own** `followedUsers` array to include or exclude `:id`. Determining "does the current viewer follow this profile" therefore requires reading the viewer's own profile, not the one being displayed — `Profile.jsx` fetches both when viewing someone else.

### CLI / local version control

`backend/src/vcs/` implements a simplified, independent version-control simulation, invoked via `node src/cli.js <command>` (or `npm run cli -- <command>`):

- `init` — creates a `.codeharbor/` metadata folder in the current directory.
- `add <file>` — copies a file into a staging area.
- `commit <message>` — snapshots staged files into a UUID-named commit folder alongside a `commit.json` (message + timestamp), then empties the staging area so the next commit only contains files added after this one. With nothing staged it prints a message and creates nothing.
- `push` / `pull` — sync commit folders with an S3 bucket via `@aws-sdk/client-s3`. The S3 client is constructed lazily and only when these commands run, so the web API has no AWS dependency; `push`/`pull` fail with a clear error if `S3_BUCKET` isn't configured.
- `revert <commitID>` — copies a past commit's files back into the working directory.

This CLI operates entirely on the local filesystem (and optionally S3) and is independent of the web API's MongoDB-backed `Repository` documents.

## Backend API contract

All endpoints are under `/api/v1`. `GET /health` (outside the prefix) is the health check. Errors are always `{ success: false, message, errors? }`.

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | — | `{ username, email, password }` | `201 { userId, username }` + session cookie; `409` if username/email taken; `400` on invalid input |
| POST | `/auth/login` | — | `{ email, password }` | `200 { userId, username }` + session cookie; `401` on bad credentials |
| POST | `/auth/logout` | — | — | `200`; clears the session cookie |
| GET | `/auth/me` | Required | — | `200 { userId, username }`; `401` if not logged in |
| GET | `/users` | — | — | Returns `username`, `email`, `createdAt` only |
| GET | `/users/:id` | — | — | Password excluded (schema-level `select: false`) |
| PUT | `/users/:id` | required, self only | `{ email?, password? }` | |
| DELETE | `/users/:id` | required, self only | — | |
| PATCH | `/users/:id/follow` | required | — | Toggles follow; `400` if `:id` is yourself |
| GET | `/repos` | optional | — | Public repos, plus your own private ones if authenticated |
| POST | `/repos` | required | `{ name, description?, visibility?, content? }` | `201 { repositoryID }`; `409` on duplicate name for that owner |
| GET | `/repos/user/:userId` | optional | — | `200 { repositories: [...] }`, always, even when empty |
| GET | `/repos/name/:name` | optional | — | Same visibility rule |
| GET | `/repos/:id` | optional | — | `404` if private and not yours |
| PUT | `/repos/:id` | required, owner only | `{ content?, description? }` | `content` is appended |
| DELETE | `/repos/:id` | required, owner only | — | |
| PATCH | `/repos/:id/visibility` | required, owner only | — | Flips `visibility` |
| GET | `/repos/:id/issues` | — | — | Newest first |
| POST | `/repos/:id/issues` | required | `{ title, description }` | `404` if the repo doesn't exist |
| GET | `/issues/:id` | — | — | |
| PUT | `/issues/:id` | required, author or repo owner | `{ title?, description?, status? }` | `status` is `"open"` or `"closed"` |
| DELETE | `/issues/:id` | required, author or repo owner | — | |

Malformed ids in `:id`/`:userId` return `400` rather than a database cast error.

## Data models

**User** — `{ username (unique), email (unique), password (bcrypt hash, select:false), repositories[], followedUsers[], starRepos[] }`

**Repository** — `{ name, description, content[], visibility (Boolean, default true), owner (ref User), issues[] }`, unique on `{ owner, name }`

**Issue** — `{ title, description, status: "open"|"closed", repository (ref Repository), author (ref User) }`

All three use Mongoose `timestamps: true`.

## Environment variables

**`backend/.env`** (copy from `backend/.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | API server port |
| `MONGO_URI` | *(required)* | MongoDB connection string |
| `CLIENT_ORIGIN` | request origin | Allowed CORS origin (credentialed, so it can't be `*`) |
| `COOKIE_SAMESITE` | `lax` in dev, `none` in production | `SameSite` for the session cookie; `render.yaml` sets `lax` because Vercel proxies `/api` on the same site |
| `JWT_SECRET` | *(required)* | Signing secret for auth tokens — server refuses to start without it |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | — | Only needed for the CLI's `push`/`pull` commands |

**`frontend/.env`** (copy from `frontend/.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3002` in dev, `""` (same origin) in production builds | Base URL the frontend calls; `/api/v1` is appended |

## Running locally

```bash
cp backend/.env.example backend/.env    # fill in MONGO_URI and JWT_SECRET
cp frontend/.env.example frontend/.env  # defaults to localhost:3002, fine for local dev

npm install            # installs root devDependency (concurrently)
npm run install:all    # installs backend/ and frontend/ dependencies
npm run dev            # runs both apps together (backend :3002, frontend :5173)
```

Or run each independently: `cd backend && npm install && npm run dev` / `cd frontend && npm install && npm run dev`.

**Using the CLI:** run `node <path-to>/backend/src/cli.js <command>` from the directory you want to version; `init` creates `.codeharbor/` there. `npm run cli -- <command>` always runs inside `backend/`, so it versions that folder instead. The CLI loads `.env` from the current directory, so for `push`/`pull` either run it where an `.env` with the AWS variables exists or export those variables in your shell.

## Testing

```bash
cd backend && npm test
```

Jest + Supertest, with the Mongoose models replaced by mocks (`tests/support/mockModels.js`), so the suite needs no database. It covers the HTTP contract: signup/login (hashing, duplicate and invalid input, identical 401s), the session cookie (httpOnly, never in the body, 7-day JWT, logout, `/me`), the auth guard on every protected route, owner-from-token on create, the visibility rules, owner/self/author authorization, issue creation and status changes, follow toggling, malformed-id handling, and the JSON 404.

The frontend has no unit tests; `npm run build` and `npm run lint` in `frontend/` are the checks.

## Deployment

- **API → Render.** `render.yaml` is a blueprint for the `backend/` service (`npm ci` / `npm start`, health check on `/health`, generated `JWT_SECRET`). Set `MONGO_URI` and `CLIENT_ORIGIN` in the Render dashboard.
- **Frontend → Vercel.** `frontend/vercel.json` rewrites `/api/*` to the Render service and everything else to `index.html` for client-side routing. Production builds call the API on the same origin, so no `VITE_API_URL` is needed there.

## Known limitations

- **JWTs are not revocable.** They're stateless by design: no server-side session store, no logout-everywhere. Logout clears the cookie in that browser, but a copied token stays valid until it expires (7 days) or `JWT_SECRET` changes. Short-lived access tokens with refresh tokens, or a database-backed session, would fix that.
- **Body-less POSTs rely on SameSite alone.** `POST /auth/logout` takes no body, so the JSON-only rule doesn't apply to it; only `SameSite=Lax` stops a forged one (harmless here, it just logs the user out). If `COOKIE_SAMESITE` were ever set to `none`, an `Origin` header check on write requests would be needed to keep CSRF protection airtight.
- **The CLI and the web app are independent.** CLI commits are local file snapshots (optionally synced to S3); they are not linked to a `Repository` document in MongoDB. There is no current path from "I ran `codeharbor commit`" to "this shows up on my CodeHarbor repo page."
- **Commits are whole-file copies, not a content-addressed object store.** There is no diffing, no tree/blob model, and no branching — the CLI demonstrates version-control ergonomics rather than implementing Git's data model.
- **The contribution heatmap is illustrative.** There is no activity-tracking pipeline; it renders randomly generated data over a real rolling 12-month window rather than a user's actual history.
- **Tests mock the database.** Integration tests against a real MongoDB (e.g. `mongodb-memory-server` in CI) would catch query-level bugs the mocked suite can't.
