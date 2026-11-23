# CodeHarbor

A code-hosting platform: users sign up, create public or private repositories, open and manage issues, follow other users, and browse profiles with an activity heatmap. It also ships a standalone CLI (`codeharbor init/add/commit/push/pull/revert`) that simulates local version control and can sync commit snapshots to an S3 bucket.

This README documents the system's architecture and contracts so it can be understood without reading the source first.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router 7, Axios |
| Backend | Node.js (ES modules), Express 4, Mongoose 8 (MongoDB), Zod request validation |
| Auth | JWT (7-day expiry) + bcrypt-hashed passwords |
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
│   │   ├── app.js                        # Express app (middleware + routes), exported — no listen()
│   │   ├── server.js                     # entry point: connects Mongo, boots Express + Socket.IO, listens
│   │   ├── cli.js                        # entry point for the `codeharbor` VCS CLI (yargs)
│   │   ├── config/
│   │   │   ├── db.js                     # mongoose.connect wrapper
│   │   │   └── s3.js                     # lazy S3 client — only constructed when push/pull actually run
│   │   ├── controllers/
│   │   │   ├── auth.controller.js        # signup / login
│   │   │   ├── user.controller.js        # profile reads + CRUD / follow toggle
│   │   │   ├── repo.controller.js        # repository CRUD + visibility
│   │   │   ├── issue.controller.js       # issue CRUD, scoped to a repository
│   │   │   └── socketManager.js          # Socket.IO setup (reserved, see below)
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
│   │   │   └── tokens.js                 # sign/verify JWTs, read the bearer token
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
        ├── context/AuthContext.jsx  # Axios client (JWT interceptor) + signup/login/logout
        ├── utils/withAuth.jsx  # HOC: redirects to /auth if no token in localStorage
        ├── utils/errorMessage.js    # API error -> one display line
        ├── components/
        │   ├── Navbar.jsx
        │   └── HeatMap.jsx
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

Signup/login (`POST /api/v1/auth/signup`, `POST /api/v1/auth/login`) issue a JWT signed with `JWT_SECRET`, payload `{ id }`, 7-day expiry. Login returns the same `401 "Invalid email or password"` for an unknown email and a wrong password, and compares against a dummy hash when the user doesn't exist so the two cases also take the same time.

The frontend stores the token and `userId` in `localStorage`. An Axios request interceptor (`AuthContext.jsx`) attaches `Authorization: Bearer <token>` to every call; a response interceptor clears storage and redirects to `/auth` on a `401` from any endpoint other than login/signup.

Server-side, two middleware variants guard routes:

- `requireAuth` — rejects with `401` if the token is missing or invalid; attaches `req.userId`.
- `optionalAuth` — attaches `req.userId` when a valid token is present, but never rejects the request. Used on reads that behave differently for anonymous vs. authenticated callers (e.g. private-repo visibility) without making the whole endpoint require login.

Authorization is a separate layer on top of authentication:

- `requireRepoOwner(param)` — loads the repository named by the given route param and rejects with `403` unless `repository.owner` matches `req.userId`. Used on repo update/delete/visibility-toggle.
- `requireSelf(param)` — rejects with `403` unless the route param matches `req.userId`. Used on profile update/delete.
- Issue update/delete checks live in `issue.controller.js` (`canModifyIssue`): the caller must be either the issue's `author` or the owner of its parent repository.

Coverage across all 20 endpoints:

| Protection level | Count | Endpoints |
| --- | --- | --- |
| Public, no auth | 6 | `auth/signup`, `auth/login`, `GET users`, `GET users/:id`, `GET repos/:id/issues`, `GET issues/:id` |
| Requires login only (no ownership check) | 3 | `PATCH users/:id/follow`, `POST repos`, `POST repos/:id/issues` |
| Ownership-based authorization (403 if not owner/self/author) | 7 | `PUT`/`DELETE users/:id`, `PUT`/`DELETE repos/:id`, `PATCH repos/:id/visibility`, `PUT`/`DELETE issues/:id` |
| Visibility-filtered reads (public/private rules) | 4 | `GET repos`, `GET repos/:id`, `GET repos/name/:name`, `GET repos/user/:userId` |

On the frontend, `withAuth()` is a route-level HOC that redirects to `/auth` if no token is present in `localStorage`. This is a UX guard only — the actual enforcement is the server-side middleware above.

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
- `commit <message>` — snapshots staged files into a UUID-named commit folder alongside a `commit.json` (message + timestamp).
- `push` / `pull` — sync commit folders with an S3 bucket via `@aws-sdk/client-s3`. The S3 client is constructed lazily and only when these commands run, so the web API has no AWS dependency; `push`/`pull` fail with a clear error if `S3_BUCKET` isn't configured.
- `revert <commitID>` — copies a past commit's files back into the working directory.

This CLI operates entirely on the local filesystem (and optionally S3) and is independent of the web API's MongoDB-backed `Repository` documents.

### Real-time (reserved)

`controllers/socketManager.js` starts a Socket.IO server and accepts a `joinRoom` event (joins a room keyed by user id). No events are currently emitted into those rooms — this is infrastructure for future features (e.g. notifying a repo owner when an issue is opened), not part of the active request flow.

## Backend API contract

All endpoints are under `/api/v1`. `GET /health` (outside the prefix) is the health check. Errors are always `{ success: false, message, errors? }`.

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | — | `{ username, email, password }` | `201 { token, userId }`; `409` if username/email taken; `400` on invalid input |
| POST | `/auth/login` | — | `{ email, password }` | `200 { token, userId }`; `401` on bad credentials |
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
| `CLIENT_ORIGIN` | `*` | Allowed CORS origin |
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

**Using the CLI:** `cd backend && npm install && node src/cli.js init` (run from whatever directory you want to version — it creates `.codeharbor/` there). `npm run cli -- <command>` also works from within `backend/`.

## Testing

```bash
cd backend && npm test
```

Jest + Supertest, with the Mongoose models replaced by mocks (`tests/support/mockModels.js`), so the suite needs no database. It covers the HTTP contract: signup/login (hashing, duplicate and invalid input, identical 401s), the auth guard on every protected route, owner-from-token on create, the visibility rules, owner/self/author authorization, issue creation and status changes, follow toggling, malformed-id handling, and the JSON 404.

The frontend has no unit tests; `npm run build` and `npm run lint` in `frontend/` are the checks.

## Deployment

- **API → Render.** `render.yaml` is a blueprint for the `backend/` service (`npm ci` / `npm start`, health check on `/health`, generated `JWT_SECRET`). Set `MONGO_URI` and `CLIENT_ORIGIN` in the Render dashboard.
- **Frontend → Vercel.** `frontend/vercel.json` rewrites `/api/*` to the Render service and everything else to `index.html` for client-side routing. Production builds call the API on the same origin, so no `VITE_API_URL` is needed there.

## Known limitations

- **JWTs are not revocable.** They're stateless by design — no server-side session store, no logout-everywhere, no refresh-token rotation. A token is valid until it expires (7 days) or the process's `JWT_SECRET` changes.
- **The CLI and the web app are independent.** CLI commits are local file snapshots (optionally synced to S3); they are not linked to a `Repository` document in MongoDB. There is no current path from "I ran `codeharbor commit`" to "this shows up on my CodeHarbor repo page."
- **Commits are whole-file copies, not a content-addressed object store.** There is no diffing, no tree/blob model, and no branching — the CLI demonstrates version-control ergonomics rather than implementing Git's data model.
- **The contribution heatmap is illustrative.** There is no activity-tracking pipeline; it renders randomly generated data over a real rolling 12-month window rather than a user's actual history.
- **Socket.IO has no active consumers yet** (see [Real-time (reserved)](#real-time-reserved)).
- **Tests mock the database.** Integration tests against a real MongoDB (e.g. `mongodb-memory-server` in CI) would catch query-level bugs the mocked suite can't.
