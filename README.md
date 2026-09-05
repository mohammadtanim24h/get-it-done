# Get It Done

A full-stack Kanban board application: users register, create boards, add
columns and tasks, share boards with other registered users, and rearrange
tasks across columns with drag-and-drop. Built as a technical assessment
project with correctness of concurrent task ordering as the core problem.

## Features

- Email/password registration and login (JWT session in an httpOnly cookie)
- Board CRUD; a board has an owner and any number of members
- Board sharing: the owner adds/removes members by email
- Column CRUD per board (rename, add, delete — deletion cascades its tasks)
- Task CRUD per column (title, description)
- Drag-and-drop task movement within and across columns, persisted through a
  transactional move endpoint that keeps positions gapless under concurrency
- Next.js client with login/register pages, board list, board detail view
  (columns, cards, members panel), optimistic UI and error states
- Automated API tests (Vitest + Supertest) and an end-to-end curl smoke test

## Tech Stack

| Layer    | Choices                                                              |
|----------|----------------------------------------------------------------------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, dnd-kit |
| Backend  | Node.js 22, Express 4, TypeScript, Zod (request validation)           |
| Database | PostgreSQL 16, Prisma ORM 7 (driver adapter `@prisma/adapter-pg`)     |
| Auth     | JWT (`jsonwebtoken`) in an httpOnly cookie, passwords hashed with bcrypt (12 rounds) |
| Infra    | Docker, docker-compose (multi-stage builds, healthchecks, one-shot migration container) |
| Tests    | Vitest, Supertest (backend); Vitest (frontend unit tests)             |

## Architecture Overview

```
Browser ── Next.js (port 3000)
              │  fetch, credentials: 'include' (session cookie)
              ▼
         Express API (port 4000)  ──  GET /health
              │  routes → middleware (auth, board authorization)
              │  → controllers (Zod validation) → services (business logic)
              │  → Prisma (transactions, row locks)
              ▼
         PostgreSQL
```

The backend is layered: routes wire HTTP methods to controllers;
`requireAuth` resolves the JWT into `req.user`; `authorizeBoard` /
`authorizeColumn` / `authorizeTask` resolve the caller's relationship to the
underlying board and reject the request before any business logic runs;
controllers validate input with Zod and delegate to services; services own
all Prisma queries, transactions, and ordering invariants. A cross-cutting
error handler maps `AppError`s, malformed JSON, and Prisma errors to a
consistent `{ error: { code, message } }` shape.

The frontend is a standard App Router app: page components pull board data
through a small API client (`frontend/src/services`) and hooks
(`frontend/src/hooks`), and the kanban view computes drag intents locally
(`compute-move.ts`) before calling the move endpoint.

## Repository Structure

```
get-it-done/
├── backend/
│   ├── prisma/               # schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── config/           # env parsing and validation
│   │   ├── controllers/      # HTTP handlers
│   │   ├── middleware/       # requireAuth, board authorization, error/not-found handlers, request logger
│   │   ├── routes/           # route wiring (auth, boards, columns, tasks, health)
│   │   ├── services/         # business logic (auth, boards, columns, tasks, task movement)
│   │   ├── validators/       # Zod schemas
│   │   ├── generated/prisma/ # generated Prisma client (committed, used by builds)
│   │   ├── app.ts            # Express app assembly (helmet, CORS, cookies, JSON)
│   │   └── server.ts         # HTTP entrypoint
│   └── tests/                # Vitest + Supertest API tests
├── frontend/
│   └── src/
│       ├── app/              # (auth) login/register, (app) boards list + board detail
│       ├── components/       # auth forms, board cards, kanban view (dnd-kit), UI primitives
│       ├── hooks/            # data-fetching hooks (board data, auth)
│       ├── services/         # API client and auth helpers
│       └── types/            # shared API types
├── scripts/smoke-test.sh     # end-to-end curl walk-through against a running backend
├── docs/API.md               # compact API reference
└── docker-compose.yml        # postgres + migrate + backend + frontend
```

## Authentication

- **Registration** (`POST /api/auth/register`) creates the account
  (bcrypt, 12 rounds). It does not log the user in.
- **Login** (`POST /api/auth/login`) verifies credentials and sets a signed
  JWT in an httpOnly cookie (`access_token`, `SameSite=Lax`, `Secure` in
  production, expiry `JWT_EXPIRES_IN`, default 1h).
- Every other endpoint requires the cookie. Missing, invalid, and expired
  tokens all return the same `401`.
- Unknown email and wrong password return the same generic `401` and burn a
  bcrypt comparison either way, so login responses don't reveal whether an
  account exists.

There is deliberately no logout endpoint and no refresh token; the session
ends when the cookie expires (see trade-offs).

## Authorization Model

Access is resolved from the database only — never from request bodies.
`requireAuth` identifies the user; authorization middleware then resolves
that user's relationship to the board behind the resource:

| Action                          | Owner | Member | Neither |
|---------------------------------|-------|--------|---------|
| Read board, columns, tasks      | yes   | yes    | 404/403 |
| Create/rename/delete columns    | yes   | yes    | 404/403 |
| Create/edit/delete/move tasks   | yes   | yes    | 404/403 |
| Rename or delete the board      | yes   | 403    | 404/403 |
| Add/remove members              | yes   | 403    | 404/403 |

Two details worth knowing:

- **404 before 403.** A board the caller can't access at all is reported as
  `404` when it doesn't exist and `403` when it exists but the caller is
  neither owner nor member — resource existence is not leaked across boards.
- **Defense in depth.** Column- and task-scoped routes resolve the parent
  board first (`authorizeColumn` / `authorizeTask`), and the services
  additionally re-verify that the column/task belongs to that board, so an id
  from another board is always a `404`, never a cross-board data leak.

## Board Sharing Behavior

- The owner shares a board by `POST /api/boards/:boardId/members` with the
  **email of an already-registered user**. There are no invite emails and no
  signup links; if no account matches, the API returns `404`.
- Membership is a single level — no per-member roles. Any member gets full
  content rights (columns, tasks, moves) but cannot rename/delete the board
  or manage members.
- The owner has no membership row (access comes from ownership), but the
  board detail response lists the owner as the first member so every reader
  can see the roster. The owner cannot be removed from their own board
  (`409`), and adding them "as a member" is rejected (`409`).
- Adding an existing member again returns `409`.
- Deleting a board cascades its memberships, columns, and tasks.

## Task Ordering Model

- Task positions are **zero-based integers** (`0, 1, 2, ...`) and are
  **contiguous within a column**: no gaps, no duplicates. Columns use the
  same convention within a board.
- Uniqueness is enforced by the database (`@@unique([columnId, position])`).
- Positions are server-assigned on create (append to the end) and are never
  accepted from the client on create/update — reordering happens exclusively
  through `PATCH /api/tasks/:taskId/move`. Editing a task cannot reorder it.
- Deleting a task (or a column) closes the resulting gap in the same
  transaction, so the contiguity invariant holds at all times.

## Task Movement Algorithm

`PATCH /api/tasks/:taskId/move` with `{ targetColumnId, targetPosition }`
relocates one task. Out-of-range positions are **rejected, not clamped**:
same-column moves accept `0..n-1`, cross-column moves accept `0..m` (an
insert at the end of the destination is valid).

The whole move runs in one PostgreSQL transaction:

1. Re-verify the target column belongs to the same board as the task (a
   cross-board column id is a `404`).
2. Lock the affected column rows (`SELECT ... FOR UPDATE`) in a
   deterministic order (sorted by id) so concurrent moves can't deadlock and
   racing moves on shared columns serialize.
3. Read authoritative positions *after* the lock. If a competing move
   relocated the task between the pre-lock read and the lock, retry with the
   task's new location (up to 3 attempts; exhaustion returns `409`).
4. "Park" the moved task at position `-1` (off the real grid), shift sibling
   rows by one position each — one row at a time, in an order chosen so no
   intermediate state violates the unique constraint — then write the task's
   final position. Every intermediate state is constraint-valid, so no
   deferrable constraints are needed.
5. Return the moved task plus the final ordering of both affected columns,
   which is exactly what the UI needs to reconcile its board state.

The same locking discipline is used on create (append position is computed
under the parent column's lock) so racing creates can't collide on the
unique constraint.

## API Overview

Base URL: `http://localhost:4000/api` (prefix configurable via `API_PREFIX`).
`GET /health` (no `/api` prefix) is the liveness probe.

Conventions:

- Success: `{ "data": { ... } }`. Deletes return `204` with no body.
- Failure: `{ "error": { "code": "...", "message": "...", "details?": ... } }`.
- All endpoints except register/login require the session cookie.

A compact reference table also lives in [`docs/API.md`](docs/API.md).

### Authentication

#### `POST /api/auth/register`

Create an account. Password: 8–72 characters.

```json
{ "name": "Alice", "email": "alice@example.com", "password": "password123" }
```

```json
{ "data": { "user": { "id": "clx...", "name": "Alice", "email": "alice@example.com", "createdAt": "2026-09-05T10:00:00.000Z" } } }
```

`201` on success. Failures: `400` validation (`VALIDATION_ERROR` with
per-field details), `409` email already registered. Emails are trimmed and
lower-cased. No cookie is set; call login afterwards.

#### `POST /api/auth/login`

Exchange credentials for a session cookie.

```json
{ "email": "alice@example.com", "password": "password123" }
```

`200` with the same `user` shape as register plus
`Set-Cookie: access_token=<jwt>; HttpOnly; SameSite=Lax; Path=/`.
Failures: `400` malformed body, `401` invalid email or password (identical
response either way).

#### `GET /api/auth/me`

Current user from the session cookie. `200` with `{ "data": { "user": ... } }`.
Failure: `401` (missing/invalid/expired cookie).

### Boards

#### `POST /api/boards`

Create a board; the caller becomes the owner. Body: `{ "title": "Project Launch" }`
(1–120 chars, trimmed).

```json
{ "data": { "board": { "id": "clx...", "title": "Project Launch", "ownerId": "clx...", "role": "owner", "createdAt": "...", "updatedAt": "..." } } }
```

`201` on success. Failures: `400` validation, `401` unauthenticated.

#### `GET /api/boards`

Boards the caller owns or is a member of, newest first, each with a computed
`role` (`owner`/`member`). Failures: `401`.

#### `GET /api/boards/:boardId`

Board detail **including the member roster** (owner first, then members as
`{ userId, name, email, addedAt }`). There is no separate member-list
endpoint — this is it. Failures: `401`, `404` board not found, `403` caller
is neither owner nor member.

#### `PATCH /api/boards/:boardId`

Rename a board (owner only). Body: `{ "title": "New title" }` (optional
field; omitted fields are unchanged). Failures: `400`, `401`, `403` (member
or outsider), `404`.

#### `DELETE /api/boards/:boardId`

Delete a board (owner only) plus its memberships, columns, and tasks.
Returns `204`. Failures: `401`, `403`, `404`.

### Members

#### `POST /api/boards/:boardId/members`

Share the board (owner only) with a registered user. Body:
`{ "email": "bob@example.com" }`.

```json
{ "data": { "member": { "userId": "clx...", "name": "Bob Member", "email": "bob@example.com", "addedAt": "..." } } }
```

`201` on success. Failures: `400`, `401`, `403` not owner, `404` board not
found **or no user registered with that email**, `409` user already a member
/ target is the owner.

#### `DELETE /api/boards/:boardId/members/:userId`

Remove a member (owner only). Returns `204`. Failures: `401`, `403` not
owner, `404` board or membership not found, `409` attempt to remove the
owner.

### Columns

#### `POST /api/boards/:boardId/columns`

Append a column at the end of the board (position server-assigned). Owner or
member. Body: `{ "title": "To Do" }`.

```json
{ "data": { "column": { "id": "clx...", "title": "To Do", "position": 0, "boardId": "clx...", "createdAt": "...", "updatedAt": "..." } } }
```

`201`. Failures: `400`, `401`, `403`, `404`.

#### `GET /api/boards/:boardId/columns`

The board's columns ordered by position, each without tasks (fetch tasks per
column). Same failure cases as above.

#### `PATCH /api/boards/:boardId/columns/:columnId`

Rename a column (owner or member). Position is never changed here — there is
no column-move endpoint. Failures: `400`, `401`, `403`, `404` (including a
`columnId` that belongs to a different board).

#### `DELETE /api/boards/:boardId/columns/:columnId`

Delete a column **and all of its tasks** (cascade), then close the position
gap among the remaining columns. Returns `204`. Same failure cases.

### Tasks

#### `POST /api/columns/:columnId/tasks`

Append a task to the end of a column (owner or member of the column's
board). Body: `{ "title": "Draft brief", "description": "..." }`
(description optional, ≤ 5000 chars).

```json
{ "data": { "task": { "id": "clx...", "title": "Draft brief", "description": "", "position": 3, "columnId": "clx...", "createdAt": "...", "updatedAt": "..." } } }
```

`201`. Failures: `400`, `401`, `403`, `404` column not found (or belongs to
a board the caller can't access).

#### `GET /api/columns/:columnId/tasks`

A column's tasks ordered by position. Failures: `401`, `403`, `404`.

#### `GET /api/tasks/:taskId`

Single task. Failures: `401`, `403`, `404` (including tasks from boards the
caller can't access).

#### `PATCH /api/tasks/:taskId`

Edit title/description. Body: `{ "title": "...", "description": "..." }`
(both optional). Position is not part of the payload — edits cannot
reorder. Failures: `400`, `401`, `403`, `404`.

#### `DELETE /api/tasks/:taskId`

Delete a task and close the ordering gap in its column. Returns `204`.
Failures: `401`, `403`, `404`.

### Movement

#### `PATCH /api/tasks/:taskId/move`

Move a task within or across columns (owner or member). Body:

```json
{ "targetColumnId": "clx...", "targetPosition": 1 }
```

`targetPosition` is a zero-based index into the destination column;
out-of-range values are rejected (`400`), not clamped. `200`:

```json
{
  "data": {
    "task": { "id": "clx...", "title": "Draft brief", "description": "", "position": 1, "columnId": "clx...", "createdAt": "...", "updatedAt": "..." },
    "sourceColumn":      { "id": "clx...", "tasks": [ { "id": "clx...", "position": 0 }, { "id": "clx...", "position": 1 } ] },
    "destinationColumn": { "id": "clx...", "tasks": [ { "id": "clx...", "position": 0 } ] }
  }
}
```

Failures: `400` invalid body or out-of-range `targetPosition`, `401`, `403`,
`404` task or column not found (including a target column from another
board), `409` sustained concurrent moves of the same task — retry.

## Local Setup (Without Docker)

Prerequisites: Node.js 22+, npm, and a PostgreSQL 16 instance you can reach.
If you don't want to install Postgres, `docker compose up -d postgres` runs
just the database and everything else stays on your host.

```bash
# 1. Backend
cd backend
cp .env.example .env
# set DATABASE_URL to your database and generate a JWT secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# put that value in backend/.env as JWT_SECRET

npm install
npm run prisma:migrate        # create schema (prisma migrate dev)
npm run db:seed               # optional: demo data (see below)
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env          # optional: code defaults already point at localhost:4000
npm install
npm run dev                   # http://localhost:3000
```

Sanity check: `curl http://localhost:4000/health` →
`{"data":{"status":"ok","database":"connected",...}}` (503 + `"degraded"`
if the database is unreachable).

## Local Setup (With Docker)

Docker with compose support is the only prerequisite. The stack is
postgres → migrate (one-shot) → backend → frontend, gated on healthchecks;
migrations never run inside the API container.

```bash
cp .env.example .env
# generate a JWT secret and set JWT_SECRET in the root .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose up -d --build
docker compose ps     # postgres, backend, frontend healthy; migrate exited 0
```

Open http://localhost:3000. The API is at http://localhost:4000.

```bash
docker compose run --rm migrate                      # apply pending migrations
docker compose run --rm migrate npx prisma db seed   # seed the database
docker compose logs -f backend                       # follow API logs
docker compose down                                  # stop (data persists)
docker compose down -v                               # stop and delete all data
```

## Environment Variables

Three env files, each with a committed `.env.example`. Nothing secret is
committed.

**`backend/.env`** — used only when the backend runs on the host; compose
injects its own values.

| Variable         | Default     | Meaning                                                                 |
|------------------|-------------|-------------------------------------------------------------------------|
| `NODE_ENV`       | development | `development` / `test` / `production` (validated at startup)             |
| `PORT`           | 4000        | HTTP port                                                                |
| `API_PREFIX`     | /api        | Path prefix for all API routes                                           |
| `CORS_ORIGIN`    | http://localhost:3000 | Comma-separated list of allowed browser origins          |
| `DATABASE_URL`   | — (required) | `postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public`            |
| `JWT_SECRET`     | — (required) | Signing secret. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRES_IN` | 1h          | Token lifetime (jsonwebtoken format: `30m`, `1h`, `7d`)                  |
| `JWT_COOKIE_NAME`| access_token | Name of the session cookie                                              |

**`frontend/.env`** — entirely optional; the code has the same defaults
built in (`frontend/src/lib/config.ts`), so local development works without
the file. `NEXT_PUBLIC_*` variables are inlined into the browser bundle at
build time, so changing them requires a rebuild (or dev-server restart).

| Variable                 | Default               | Meaning                              |
|--------------------------|-----------------------|--------------------------------------|
| `NEXT_PUBLIC_API_URL`    | http://localhost:4000 | Backend URL as reached from the browser |
| `NEXT_PUBLIC_API_PREFIX` | /api                  | Route prefix the backend mounts       |

**Root `.env`** — read by docker-compose only.

| Variable              | Default | Meaning                                                        |
|-----------------------|---------|----------------------------------------------------------------|
| `POSTGRES_USER`       | postgres | Database user (must match `DATABASE_URL` if mixing host/compose) |
| `POSTGRES_PASSWORD`   | postgres | Database password                                                |
| `POSTGRES_DB`         | get_it_done | Database name                                                 |
| `POSTGRES_PORT`       | 5432    | Port published on the host                                      |
| `JWT_SECRET`          | — (required) | Passed to the backend container; compose refuses to start without it |
| `JWT_EXPIRES_IN`      | 1h      | Passed to the backend container                                 |
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | Frontend build arg (browser-reachable API URL)   |
| `NEXT_PUBLIC_API_PREFIX` | /api   | Frontend build arg                                              |

## Database Migrations & Seed Data

```bash
cd backend
npm run prisma:migrate      # create/apply migrations during development
npx prisma migrate deploy   # apply committed migrations without creating new ones
npm run db:seed             # seed demo data
npm run db:reset            # drop, re-migrate, and re-seed
```

In Docker, the same commands run through the migrate container (see above).
New migrations are always authored from the host workflow against a
reachable database, then applied elsewhere with `migrate deploy`.

The seed **wipes all data** (tasks, columns, memberships, boards, users — in
FK order) and inserts:

- `alice@example.com` / `password123` — owner of the board "Project Launch"
- `bob@example.com` / `password123` — member of that board
- 3 columns (To Do, In Progress, Done) and 5 tasks

Passwords are hashed with the app's own bcrypt helper, so both accounts can
log in immediately.

## Commands Reference

Run inside `backend/` or `frontend/`:

| Command              | Backend                        | Frontend                  |
|----------------------|--------------------------------|---------------------------|
| `npm run dev`        | API with tsx watch (:4000)     | Next.js dev server (:3000) |
| `npm run build`      | Compile to `dist/`             | Production build           |
| `npm start`          | `node dist/server.js`          | `next start`               |
| `npm test`           | Vitest + Supertest API tests   | Vitest unit tests          |
| `npm run lint`       | ESLint                         | ESLint                     |
| `npm run typecheck`  | `tsc --noEmit`                 | `tsc --noEmit`             |

Backend tests mock the Prisma layer, so they need no database and no
`JWT_SECRET` (a test default is used). The end-to-end smoke test runs
against a live, migrated backend:

```bash
./scripts/smoke-test.sh                 # against http://localhost:4000
API_BASE=http://host:port/api ./scripts/smoke-test.sh
```

It walks register → login → board/column/task lifecycle → sharing →
authorization denials → movement with curl and cookie jars.

## Example API Session

```bash
API=http://localhost:4000/api

# Register two users, log in as the first (cookie saved to jar)
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com","password":"password123"}'
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Bob","email":"bob@example.com","password":"password123"}'
curl -s -c jar.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"password123"}'

# Create a board and share it with Bob
BOARD=$(curl -s -b jar.txt -X POST $API/boards -H 'Content-Type: application/json' \
  -d '{"title":"Project Launch"}' | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -b jar.txt -X POST $API/boards/$BOARD/members -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com"}'

# Add a column and a task, then move the task to position 0
COLUMN=$(curl -s -b jar.txt -X POST $API/boards/$BOARD/columns \
  -H 'Content-Type: application/json' -d '{"title":"To Do"}' \
  | sed -E 's/.*"id":"([^"]+)".*/\1/')
TASK=$(curl -s -b jar.txt -X POST $API/columns/$COLUMN/tasks \
  -H 'Content-Type: application/json' -d '{"title":"Draft brief"}' \
  | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -b jar.txt -X PATCH $API/tasks/$TASK/move -H 'Content-Type: application/json' \
  -d "{\"targetColumnId\":\"$COLUMN\",\"targetPosition\":0}"
```

## Security Considerations

- **Passwords**: bcrypt with 12 rounds; hashes never leave the service layer.
- **Sessions**: JWT in an httpOnly cookie (no JS access), `SameSite=Lax`,
  `Secure` in production, 1h expiry. Cookie name and secret come from env.
- **Enumeration resistance**: identical `401` (and comparable timing) for
  unknown email vs wrong password on login.
- **Cross-tenant safety**: ids from other boards resolve to `404`, never to
  data; authorization is always derived from the database, never from client
  input; column/task routes re-verify board parentage inside the services.
- **Input validation**: every request body is parsed with Zod at the
  boundary; JSON bodies are capped at 1 MB; malformed JSON is a `400`.
- **Headers**: `helmet()` sets the default secure headers; CORS is an
  explicit allowlist with credentials enabled.
- **Error handling**: unexpected errors are logged server-side but return a
  generic message in production — no stack traces or internals leak.
- **Containers**: multi-stage builds, non-root users, healthchecks; the
  runtime image excludes dev dependencies and the Prisma CLI.
- Known gaps (deliberate, see trade-offs): no logout/refresh, no rate
  limiting, no email verification.

## Deployment Guidance

The docker-compose file is a working reference for any single-host
deployment and encodes the important operational decisions:

1. **Migrate explicitly.** Schema changes go through `prisma migrate deploy`
   as a separate step (the one-shot `migrate` service), never during app
   startup. Run it before rolling new API versions.
2. **Secrets via environment.** `JWT_SECRET` must come from the environment
   or a secret store — compose is configured to fail fast if it's missing.
   `POSTGRES_PASSWORD` must be changed from the default.
3. **TLS.** The session cookie is only marked `Secure` in production; put
   the app behind HTTPS (a reverse proxy terminating TLS is fine). Point
   `CORS_ORIGIN` at the real browser origin(s).
4. **Frontend build args.** `NEXT_PUBLIC_API_URL` is baked into the browser
   bundle at build time — set it to the public API URL when building the
   image, and rebuild if it changes.
5. **State.** Only PostgreSQL holds state; the API containers are
   stateless. Back up / attach a managed database as needed (`postgres-data`
   volume locally).
6. **Healthchecks.** Both containers expose `/health`-based checks usable
   directly by orchestrators.

## Design Decisions and Trade-offs

Where more than one reasonable approach existed, the choice made:

- **Cookie session vs. Authorization header.** Chose an httpOnly cookie so
  tokens are unreachable from client JS; the cost is CSRF surface, kept
  small by `SameSite=Lax` (state-changing routes are also method-restricted
  PATCH/POST/DELETE with JSON bodies, which HTML forms can't produce
  cross-origin). No refresh token / logout: acceptable for this scope, means
  a stolen cookie is valid until expiry.
- **Contiguous integer positions vs. fractional/gapped positions.**
  Fractional positions make moves O(1) but need periodic rebalancing and
  complicate uniqueness. Contiguous positions keep the data model honest
  (DB-enforced uniqueness, position == array index for the UI) at the cost
  of O(n) single-row updates per move — fine at this scale, and the
  algorithm keeps every intermediate state constraint-valid.
- **Reject vs. clamp out-of-range moves.** Rejecting (`400`) surfaces stale
  clients instead of silently moving a task somewhere unexpected.
- **Parking position (`-1`) vs. deferrable unique constraint.** Deferring
  the constraint check would allow bulk updates but weakens the invariant
  for every other writer; parking the moved row and shifting siblings in a
  collision-free order keeps the constraint immediate at all times.
- **Deterministic lock ordering vs. letting Postgres resolve contention.**
  Sorting column ids before `SELECT ... FOR UPDATE` prevents deadlocks
  between concurrent moves instead of relying on retries after a deadlock.
- **Owner without a membership row.** Ownership is a relationship to the
  board, not a membership; this avoids special-casing "owner as member"
  everywhere, at the cost of prepending the owner to member lists in the
  board detail response.
- **Membership by existing email vs. invite links.** No mail infrastructure
  is required; the trade-off is that invitees must register before being
  share targets.
- **Single member level vs. roles (editor/viewer).** Two roles (owner,
  member) match the requirements; the permission checks are centralized in
  one service, so adding roles later is a localized change.
- **Column deletion cascades tasks.** Explicit and atomic; the alternative
  (blocking deletion of non-empty columns or moving tasks elsewhere) adds a
  workflow the UI doesn't have.
- **No column reordering endpoint.** Columns are append-only at position
  n-1; the frontend renders them in order. Drag-reorder for columns was not
  in scope.
- **No pagination.** Board counts are small by assumption; list endpoints
  return full results.
- **Backend tests mock Prisma.** Fast, hermetic HTTP-level tests; the cost
  is that transaction/locking behavior (the riskiest part) is covered by the
  smoke test against a real database rather than the unit suite.
