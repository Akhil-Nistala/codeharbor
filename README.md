# CodeHarbor

A code-hosting platform: sign up, create public or private repositories, open issues on them, follow other users, and browse a profile with an activity heatmap. It also ships a small standalone CLI (`codeharbor init/add/commit/push/pull/revert`) that simulates local version control and can push/pull commit snapshots to an S3 bucket.

This README is meant to be self-sufficient — a reader (human or agent) should be able to understand the entire system, its contracts, and its known rough edges without opening the source first.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router 7, Axios |
| Backend | Node.js (CommonJS), Express 4, Mongoose 8 (MongoDB) |
| Auth | JWT (7-day expiry) + bcrypt-hashed passwords |
| CLI / VCS simulation | Node.js + yargs, AWS SDK v3 (`@aws-sdk/client-s3`) for push/pull |

No TypeScript. No automated test suite for this project (see [Verification performed](#verification-performed) for what was actually checked and how).

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

## How it fits together (request/data flow)

1. **Signup/Login** (`Login.jsx`/`Signup.jsx` → `AuthContext` → `POST /signup` or `/login`) — returns a JWT (`{ id }` payload, 7-day expiry) and a `userId`. The frontend stores both in `localStorage`; an Axios request interceptor attaches `Authorization: Bearer <token>` to every call, and a response interceptor clears storage and redirects to `/auth` on any `401`.
2. **Route protection** — `Dashboard`, `CreateRepository`, `RepositoryDetail`, and `Profile` are wrapped in `withAuth()`, a client-side redirect guard. Real enforcement is server-side: `requireAuth` on mutating routes, `optionalAuth` on reads that behave differently for anonymous vs. logged-in callers.
3. **Creating a repository** — `POST /repo/create` sets `owner` from the authenticated `req.userId` (never trusts a client-supplied owner field), defaults `visibility` to `true` (public), and enforces a **per-owner** unique repo name via a compound index (`{ owner, name }`) — two different users can each have a repo named `notes`.
4. **Reading repositories** — `GET /repo/all`, `/repo/:id`, `/repo/name/:name`, and `/repo/user/:userID` all run through `optionalAuth` and filter with the same rule: a private repo is only visible in the response if the requester is its owner. Anonymous or other-user requests get a `404` for a private repo (indistinguishable from "doesn't exist" — no leak of its existence).
5. **Mutating a repository** — `PUT /repo/update/:id`, `DELETE /repo/delete/:id`, and `PATCH /repo/toggle/:id` all sit behind `requireAuth` + `requireRepoOwner("id")`, which loads the repo and checks `repository.owner` against `req.userId` before letting the controller run.
6. **Issues** — created via `POST /issue/create/:id` (`:id` is the *repository* id), scoped into that repo's `issues` array on creation. Reading is open (`GET /repo/:id/issues`, `GET /issue/:id`); updating/deleting requires the caller to be either the issue's `author` or the repository's `owner` (checked in `issue.controller.js`'s `canModifyIssue`).
7. **Following** — `PATCH /user/:id/follow` toggles the *caller's* `followedUsers` array to include/exclude `:id`. `Profile.jsx` determines "am I following this person" by checking **its own** profile's `followedUsers`, not the viewed profile's — those are different lists and easy to mix up (this was actually caught and fixed during development; see [Notable implementation choices](#notable-implementation-choices-already-made)).
8. **The CLI** (`codeharbor init/add/commit/push/pull/revert`, run from `backend/`, `npm run cli -- <command>`) is a separate, simplified local version-control simulation — unrelated to the web API's MongoDB data. `init` creates a `.codeharbor/` folder in the current directory; `add <file>` copies a file into a staging area; `commit <message>` snapshots staged files into a UUID-named commit folder; `push`/`pull` sync those commit folders with an S3 bucket (only if `S3_BUCKET` is configured — the CLI throws a clear error rather than crashing obscurely if it isn't); `revert <commitID>` copies a past commit's files back into the working directory.

## Backend API contract

All endpoints are mounted at the API root (no `/api` prefix, matching how the original project was already wired).

| Method | Path | Auth | Body / Query | Notes |
| --- | --- | --- | --- | --- |
| POST | `/signup` | — | `{ username, email, password }` | `409` if username/email taken |
| POST | `/login` | — | `{ email, password }` | `400` on bad credentials |
| GET | `/allUsers` | — | — | Returns `username`, `email`, `createdAt` only (no password) |
| GET | `/userProfile/:id` | — | — | Password excluded (schema-level `select: false`) |
| PUT | `/updateProfile/:id` | required, self only | `{ email?, password? }` | |
| DELETE | `/deleteProfile/:id` | required, self only | — | |
| PATCH | `/user/:id/follow` | required | — | Toggles follow; `400` if `:id` is yourself |
| POST | `/repo/create` | required | `{ name, description?, visibility?, content? }` | `409` on duplicate name for that owner |
| GET | `/repo/all` | optional | — | Public repos, plus your own private ones if authenticated |
| GET | `/repo/:id` | optional | — | `404` if private and not yours |
| GET | `/repo/name/:name` | optional | — | Same visibility rule |
| GET | `/repo/user/:userID` | optional | — | Always `200 { repositories: [...] }`, even when empty (this used to be a `404` with no `repositories` key, which crashed the dashboard for new users — see below) |
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

All three have Mongoose `timestamps: true` (passed correctly as schema *options* — see below).

## Environment variables

**`backend/.env`** (copy from `backend/.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | API server port |
| `MONGODB_URI` | *(required)* | MongoDB connection string |
| `CLIENT_ORIGIN` | `*` | Allowed CORS origin |
| `JWT_SECRET` | *(required)* | Signing secret for auth tokens — server refuses to start without it |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | — | Only needed for the CLI's `push`/`pull` commands; the web API never touches AWS |

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

## Verification performed

There's no automated test suite here (unlike a couple of my other projects) — for a project this size, I verified it by actually running it rather than writing a parallel test harness for it after the fact. Specifically, against a real local MongoDB instance:

- A full REST walkthrough by hand with `curl`: signup, duplicate-signup rejection, login, wrong-password rejection, creating a private repo, duplicate-name rejection, confirming a private repo is `404` to everyone except its owner (both anonymous and as a *different* logged-in user), confirming a non-owner gets `403` trying to update/delete/toggle someone else's repo, unauthenticated repo creation getting `401`, issue creation + an owner (not the issue's author) successfully closing it, the repository's `issues` array actually populating, follow/unfollow, and a non-owner getting `403` trying to delete someone else's account.
- A Node script exercising the exact request shapes and response-field assumptions the React components make (not just "does the API work" but "does it return what the frontend actually reads") — including a brand-new user's empty-dashboard load, repo creation, issue creation, and the follow/unfollow flow — run against the backend with its CORS origin locked to `http://localhost:5173` (not a wildcard), matching how the real frontend would call it.
- `npm run build` on the frontend (catches broken imports/JSX syntax across the whole module graph) plus fetching every component and stylesheet through the Vite dev server directly to confirm each transforms without error.
- No interactive browser was available in this environment, so the above is what stands in for a manual click-through — it isn't a substitute for actually clicking through the UI once, which is worth doing before you rely on it.

One real bug was caught by this process and fixed before it shipped: `Profile.jsx`'s "are we following this person" check was initially reading the *viewed* profile's `followedUsers` list instead of the *viewer's own* — it would have shown the wrong follow/unfollow state. Fixed by fetching the viewer's own profile to compute that, and verified with the script above.

## Known gaps & tradeoffs

- **JWTs aren't revocable** — stateless by design, no logout-everywhere/revoke capability. A leaked token is valid until it expires (7 days).
- **No refresh tokens** — once a token expires, the user is logged out (redirected to `/auth` on the next `401`) rather than silently refreshed.
- **The CLI and the web app don't talk to each other.** The CLI's commits are local file copies (optionally synced to S3); they're not linked to a `Repository` document in MongoDB. A "push my commits and see them on my CodeHarbor repo page" integration would be the natural next step, but is a genuinely separate feature, not a bug fix.
- **No real diffing/objects** — commits are whole-file copies into a UUID-named folder, not a real content-addressed object store like actual Git. Fine for demonstrating the CLI ergonomics; not a real VCS implementation.
- **The heatmap is illustrative, not real activity data** — there's no commit-tracking pipeline wiring actual user activity into it, so it's randomly generated over a real (rolling 12-month) date range rather than tied to anything the user actually did.
- **Socket.IO is wired up in `server.js` (join a room by user id) but nothing emits to it yet** — it's a real, working stub for future features like "notify me when someone opens an issue on my repo," documented here so it isn't mistaken for dead code or a bug.
- **No automated tests** — see [Verification performed](#verification-performed) for what was actually checked instead. A Jest + Supertest suite (mocking the Mongoose models, same pattern used on my Lumen/MeetSphere project) would be the natural addition if this needed CI coverage.

## Notable implementation choices already made (so they aren't "rediscovered" as bugs)

- **The original `authMiddleware.js`/`authorizeMiddleware.js` files were completely empty.** Every mutating route — create/update/delete/toggle a repo, create/update/delete an issue, update/delete a user profile — was reachable with no authentication at all, despite the app issuing JWTs at login. This was the single biggest fix here: `auth.middleware.js` (`requireAuth`, `optionalAuth`) and `authorize.middleware.js` (`requireRepoOwner`, `requireSelf`) are new, and every route that should be protected now is — verified in the walkthrough above.
- **Repository visibility was a schema field that nothing ever checked.** `GET /repo/all`, `/repo/:id`, etc. returned private repos to anyone who asked. Fixed by filtering every read path through an owner-aware query.
- **The original `userController.js` used the raw `mongodb` driver against a hardcoded `"githubclone"` database, while every other controller used Mongoose against whatever database `MONGODB_URI` pointed to.** If those ever differed, `Repository.find().populate("owner")` would silently fail to find users. Unified everything onto the Mongoose models.
- Also in that raw-driver code: `result.insertId` (should be `insertedId`) and `result.deleteCount` (should be `deletedCount`) — both wrong property names for the `mongodb` v6 driver, meaning signup's JWT `id` was `undefined` and profile deletion always reported success even when nothing was deleted. Moot now that it's all Mongoose, but worth knowing if you ever see similar code elsewhere.
- **`issueController.js` had two missing `await`s** (`getAllIssues`, `deleteIssueById`) — both returned/checked a Promise object instead of the actual result, so `if (!issues)` and `if (!issue)` never triggered.
- **The issue routes never actually captured the repository id.** `POST /issue/create` and `GET /issue/all` had no `:id` in their path, but the controllers read `req.params.id` anyway — always `undefined`. Fixed by changing the paths to `/issue/create/:id` and `/repo/:id/issues`.
- **`Repository.issues` was never actually populated.** Creating or deleting an issue never touched the parent repository's `issues` array, so `populate("issues")` always returned `[]`. Fixed by pushing/pulling the issue id on create/delete.
- **All three Mongoose schemas had `timestamps: true` written as a *field* inside the schema definition** (`new Schema({ timestamps: true, name: ... })`) instead of passed as the schema *options* (`new Schema({ name: ... }, { timestamps: true })`) — so `createdAt`/`updatedAt` were never actually being generated. Fixed in all three models.
- **Repository names were globally unique** (`name: { unique: true }`), meaning only one user in the entire app could ever have a repo called `notes`. Changed to a compound `{ owner, name }` unique index, matching how GitHub itself scopes repo names.
- **`aws-sdk` v2 was deprecated (end-of-support)** and pulled in a vulnerable transitive `uuid`. Migrated `push`/`pull` to `@aws-sdk/client-s3` (v3) and bumped the project's own `uuid` dependency to a patched major version — `npm audit` now reports zero vulnerabilities in the backend.
- **The S3 bucket name was a hardcoded placeholder string** (`"insert_bucket_name"`) in `aws-config.js`, while `init.js` separately wrote `process.env.S3_BUCKET` into the local repo config — two different, disconnected sources of truth, one of which could never have worked. Centralized on `S3_BUCKET` from the environment, constructed lazily so the web API doesn't need AWS credentials just to boot.
- **The frontend had no `vite.config.js` at all** despite `@vitejs/plugin-react` being installed — meaning React Fast Refresh was never actually wired up. Fixed by scaffolding a fresh, standard Vite React setup rather than patching around the gap.
- **`App.jsx` was dead code** — still the default Vite counter-button demo, imported in `main.jsx` but never rendered (the app actually rendered a separate `ProjectRoutes` component). Removed; `App.jsx` now is what's actually rendered.
- **The Navbar hotlinked GitHub's own logo** (`https://www.github.com/images/modules/logos_page/GitHub-Mark.png`) and the whole app referred to itself as "GitHub" in the UI. Replaced with the project's own name and a local icon — both a branding and a "don't depend on a third party's CDN for your own UI" fix.
- **Frontend `package.json` had `"install"` and `"npm"` listed as devDependencies** — not real project dependencies, almost certainly an accidental `npm install npm`/`npm install install` at some point. Removed. Also removed `@primer/css` (never imported anywhere) and, later, `@primer/react`/`@primer/octicons-react`/`styled-components` once the auth/profile pages were rebuilt with the app's own existing dark theme instead of pulling in Primer's component library for a handful of elements.
- **The API base URL (`http://localhost:3002`) was hardcoded as a literal string in four different files.** Centralized into `src/config/api.js`, reading `VITE_API_URL`.
- **`Dashboard.jsx` would crash for a brand-new user.** The old `/repo/user/:userID` endpoint returned `404` (with no `.repositories` key) when a user had zero repos — a normal state, not an error — and the frontend did `setRepositories(data.repositories)` unconditionally, so the next render's `.filter()` call threw on `undefined`. Fixed on both ends: the endpoint now always returns `200 { repositories: [] }`, and the frontend defaults to `[]` regardless.
- **The Profile page's "Follow" button had no backend endpoint to call and no route to view anyone else's profile** — the schema already had a `followedUsers` array, but nothing used it. Added `PATCH /user/:id/follow` and an optional `/profile/:id` route so the feature is real, not decorative.
