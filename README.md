# CodeHarbor

A code-hosting platform: users sign up, create public or private repositories, open and manage issues, follow other users, and browse profiles with an activity heatmap. It also ships a standalone CLI (`codeharbor init/add/commit/push/pull/revert`) that simulates local version control and can sync commit snapshots to an S3 bucket.

This README documents the system's architecture and contracts so it can be understood without reading the source first.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router 7, Axios |
| Backend | Node.js (CommonJS), Express 4, Mongoose 8 (MongoDB) |
| Auth | JWT (7-day expiry) + bcrypt-hashed passwords |
| CLI / VCS simulation | Node.js + yargs, AWS SDK v3 (`@aws-sdk/client-s3`) for push/pull |

No TypeScript. No automated test suite — see [Testing](#testing).

## Repository layout

```
codeharbor/
├── package.json              # root: `npm run dev` runs both apps via concurrently
├── LICENSE                   # MIT
├── backend/
│   ├── .env.example          # PORT, MONGODB_URI, JWT_SECRET, CLIENT_ORIGIN, AWS/S3 vars
│   ├── package.json
│   └── src/
│       ├── app.js                        # Express app (routes + middleware), exported — no listen()
│       ├── server.js                     # entry point: connects Mongo, boots Express + Socket.IO, listens
│       ├── cli.js                        # entry point for the `codeharbor` VCS CLI (yargs)
│       ├── config/
│       │   ├── db.js                     # mongoose.connect wrapper
│       │   └── s3.js                     # lazy S3 client — only constructed when push/pull actually run
│       ├── controllers/
│       │   ├── user.controller.js        # signup / login / profile CRUD / follow toggle
│       │   ├── repo.controller.js        # repository CRUD + visibility
│       │   └── issue.controller.js       # issue CRUD, scoped to a repository
│       ├── middleware/
│       │   ├── auth.middleware.js        # requireAuth (hard 401) + optionalAuth (soft, for public/private repo reads)
│       │   └── authorize.middleware.js   # requireRepoOwner, requireSelf
│       ├── models/
│       │   ├── user.model.js
│       │   ├── repo.model.js
│       │   └── issue.model.js
│       ├── routes/
│       │   ├── index.js                  # mounts the three route files + /health
│       │   ├── user.routes.js
│       │   ├── repo.routes.js
│       │   └── issue.routes.js
│       └── vcs/                          # the local git-like CLI, separate from the web API
│           ├── init.js, add.js, commit.js, push.js, pull.js, revert.js
└── frontend/
    ├── .env.example           # VITE_API_URL
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx, App.jsx
        ├── config/api.js       # reads VITE_API_URL
        ├── context/AuthContext.jsx  # Axios client (JWT interceptor) + signup/login/logout
        ├── utils/withAuth.jsx  # HOC: redirects to /auth if no token in localStorage
        └── components/
            ├── Navbar.jsx
            ├── auth/Login.jsx, auth/Signup.jsx
            ├── dashboard/Dashboard.jsx      # "/" — your repos + public repos to browse
            ├── repo/CreateRepository.jsx    # "/create"
            ├── repo/RepositoryDetail.jsx    # "/repo/:id" — content, issues, owner actions
            └── user/Profile.jsx, user/HeatMap.jsx  # "/profile" and "/profile/:id"
```

## Architecture

### Authentication

Signup/login (`POST /signup`, `POST /login`) issue a JWT signed with `JWT_SECRET`, payload `{ id }`, 7-day expiry. The frontend stores the token and `userId` in `localStorage`. An Axios request interceptor (`AuthContext.jsx`) attaches `Authorization: Bearer <token>` to every call; a response interceptor clears storage and redirects to `/auth` on any `401`.

Server-side, two middleware variants guard routes:

- `requireAuth` — rejects with `401` if the token is missing or invalid; attaches `req.userId`.
- `optionalAuth` — attaches `req.userId` when a valid token is present, but never rejects the request. Used on reads that behave differently for anonymous vs. authenticated callers (e.g. private-repo visibility) without making the whole endpoint require login.

Authorization is a separate layer on top of authentication:

- `requireRepoOwner(param)` — loads the repository named by the given route param and rejects with `403` unless `repository.owner` matches `req.userId`. Used on repo update/delete/visibility-toggle.
- `requireSelf(param)` — rejects with `403` unless the route param matches `req.userId`. Used on profile update/delete.
- Issue update/delete checks are inline in `issue.controller.js` (`canModifyIssue`): the caller must be either the issue's `author` or the owner of its parent repository.

On the frontend, `withAuth()` is a route-level HOC that redirects to `/auth` if no token is present in `localStorage`. This is a UX guard only — the actual enforcement is the server-side middleware above.

### Repositories

`POST /repo/create` sets `owner` from `req.userId` (never from the request body), defaults `visibility` to `true`, and enforces repository-name uniqueness **per owner** via a compound Mongoose index (`{ owner, name }`) rather than globally.

Every read path (`/repo/all`, `/repo/:id`, `/repo/name/:name`, `/repo/user/:userID`) applies the same visibility rule: a private repository is included in the response only if the requester is its owner. A private repo requested by anyone else — authenticated or not — returns `404`, the same response as a nonexistent repo.

### Issues

Issues are created via `POST /issue/create/:id`, where `:id` is the repository id; creation also pushes the new issue's id into that repository's `issues` array. Reading is unauthenticated (`GET /repo/:id/issues`, `GET /issue/:id`); updating and deleting require the caller to be the issue's author or the repository's owner.

### Following

`PATCH /user/:id/follow` toggles the **caller's own** `followedUsers` array to include or exclude `:id`. Determining "does the current viewer follow this profile" therefore requires reading the viewer's own profile, not the one being displayed — `Profile.jsx` fetches both when viewing someone else.

### CLI / local version control

`backend/src/vcs/` implements a simplified, independent version-control simulation, invoked via `node src/cli.js <command>` (or `npm run cli -- <command>`):

- `init` — creates a `.codeharbor/` metadata folder in the current directory.
- `add <file>` — copies a file into a staging area.
- `commit <message>` — snapshots staged files into a UUID-named commit folder alongside a `commit.json` (message + timestamp).
- `push` / `pull` — sync commit folders with an S3 bucket via `@aws-sdk/client-s3`. The S3 client is constructed lazily and only when these commands run, so the web API has no AWS dependency; `push`/`pull` fail with a clear error if `S3_BUCKET` isn't configured.
- `revert <commitID>` — copies a past commit's files back into the working directory.

This CLI operates entirely on the local filesystem (and optionally S3) and is independent of the web API's MongoDB-backed `Repository` documents.

### Real-time (reserved)

`server.js` starts a Socket.IO server and accepts a `joinRoom` event (joins a room keyed by user id). No events are currently emitted into those rooms — this is infrastructure for future features (e.g. notifying a repo owner when an issue is opened), not part of the active request flow.

## Backend API contract

All endpoints are mounted at the API root (no `/api` prefix).

| Method | Path | Auth | Body / Query | Notes |
| --- | --- | --- | --- | --- |
| POST | `/signup` | — | `{ username, email, password }` | `409` if username/email taken |
| POST | `/login` | — | `{ email, password }` | `400` on bad credentials |
| GET | `/allUsers` | — | — | Returns `username`, `email`, `createdAt` only |
| GET | `/userProfile/:id` | — | — | Password excluded (schema-level `select: false`) |
| PUT | `/updateProfile/:id` | required, self only | `{ email?, password? }` | |
| DELETE | `/deleteProfile/:id` | required, self only | — | |
| PATCH | `/user/:id/follow` | required | — | Toggles follow; `400` if `:id` is yourself |
| POST | `/repo/create` | required | `{ name, description?, visibility?, content? }` | `409` on duplicate name for that owner |
| GET | `/repo/all` | optional | — | Public repos, plus your own private ones if authenticated |
| GET | `/repo/:id` | optional | — | `404` if private and not yours |
| GET | `/repo/name/:name` | optional | — | Same visibility rule |
| GET | `/repo/user/:userID` | optional | — | `200 { repositories: [...] }`, always, even when empty |
| PUT | `/repo/update/:id` | required, owner only | `{ content?, description? }` | |
| DELETE | `/repo/delete/:id` | required, owner only | — | |
| PATCH | `/repo/toggle/:id` | required, owner only | — | Flips `visibility` |
| POST | `/issue/create/:id` | required | `{ title, description }` | `:id` = repository id |
| GET | `/repo/:id/issues` | — | — | |
| GET | `/issue/:id` | — | — | |
| PUT | `/issue/update/:id` | required, author or repo owner | `{ title?, description?, status? }` | |
| DELETE | `/issue/delete/:id` | required, author or repo owner | — | |

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
| `MONGODB_URI` | *(required)* | MongoDB connection string |
| `CLIENT_ORIGIN` | `*` | Allowed CORS origin |
| `JWT_SECRET` | *(required)* | Signing secret for auth tokens — server refuses to start without it |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | — | Only needed for the CLI's `push`/`pull` commands |

**`frontend/.env`** (copy from `frontend/.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3002` | Base URL the frontend calls |

## Running locally

```bash
cp backend/.env.example backend/.env    # fill in MONGODB_URI and JWT_SECRET
cp frontend/.env.example frontend/.env  # defaults to localhost:3002, fine for local dev

npm install            # installs root devDependency (concurrently)
npm run install:all    # installs backend/ and frontend/ dependencies
npm run dev            # runs both apps together (backend :3002, frontend :5173)
```

Or run each independently: `cd backend && npm install && npm run dev` / `cd frontend && npm install && npm run dev`.

**Using the CLI:** `cd backend && npm install && node src/cli.js init` (run from whatever directory you want to version — it creates `.codeharbor/` there). `npm run cli -- <command>` also works from within `backend/`.

## Testing

There is no automated test suite. The system was verified against a real local MongoDB instance: a full REST walkthrough covering auth, ownership enforcement, repository visibility rules, issue authorization, and the follow/unfollow flow; and a script exercising the exact request/response shapes the frontend depends on, run with the backend's CORS origin locked to the frontend's actual origin. The frontend was verified via `npm run build` (which resolves and transforms the full module graph) and by fetching each component and stylesheet through the Vite dev server.

A Jest + Supertest suite with the Mongoose model layer mocked (the same pattern used on the author's other projects) would be the natural addition for CI coverage.

## Known limitations

- **JWTs are not revocable.** They're stateless by design — no server-side session store, no logout-everywhere, no refresh-token rotation. A token is valid until it expires (7 days) or the process's `JWT_SECRET` changes.
- **The CLI and the web app are independent.** CLI commits are local file snapshots (optionally synced to S3); they are not linked to a `Repository` document in MongoDB. There is no current path from "I ran `codeharbor commit`" to "this shows up on my CodeHarbor repo page."
- **Commits are whole-file copies, not a content-addressed object store.** There is no diffing, no tree/blob model, and no branching — the CLI demonstrates version-control ergonomics rather than implementing Git's data model.
- **The contribution heatmap is illustrative.** There is no activity-tracking pipeline; it renders randomly generated data over a real rolling 12-month window rather than a user's actual history.
- **Socket.IO has no active consumers yet** (see [Real-time (reserved)](#real-time-reserved)).
