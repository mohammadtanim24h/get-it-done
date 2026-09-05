# Get It Done

A full-stack Kanban board application: users register, create boards, add
columns and tasks, share boards with other registered users, and rearrange
tasks across columns with drag-and-drop. Built as a technical assessment
project with correctness of concurrent task ordering as the core problem.

**API reference: [`docs/API.md`](docs/API.md)** — all endpoints, request/response
shapes, and error codes.

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
│   │   ├── generated/prisma/ # generated Prisma client (created locally by prisma generate; not committed)
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
├── docs/API.md               # API reference
└── docker-compose.yml        # postgres + migrate + backend + frontend
```

## Local Setup

Two ways to run the app; pick one. Docker is the fastest path to a working
stack.

### Option A: Docker (recommended)

Prerequisite: Docker with compose support. The stack is postgres → migrate
(one-shot) → backend → frontend, gated on healthchecks; migrations never run
inside the API container.

1. Copy the root env template and set a JWT secret:

   ```bash
   cp .env.example .env
   # generate a secret and put it in .env as JWT_SECRET:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Build and start:

   ```bash
   docker compose up -d --build
   ```

3. Verify: `docker compose ps` shows postgres, backend, frontend healthy and
   `migrate` exited 0.

4. (Optional) seed demo data:

   ```bash
   docker compose run --rm migrate npx prisma db seed
   ```

Open http://localhost:3000. The API is at http://localhost:4000.

Useful commands:

```bash
docker compose run --rm migrate                      # apply pending migrations
docker compose logs -f backend                       # follow API logs
docker compose down                                  # stop (data persists)
docker compose down -v                               # stop and delete all data
```

### Option B: Without Docker

Prerequisites: Node.js 22+, npm, and a PostgreSQL 16 instance you can reach.
If you don't want to install Postgres, `docker compose up -d postgres` runs
just the database and everything else stays on your host.

1. Backend:

   ```bash
   cd backend
   cp .env.example .env
   # set DATABASE_URL to your database, and generate a JWT secret:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # put that value in backend/.env as JWT_SECRET

   npm install
   npm run prisma:migrate        # create schema (prisma migrate dev)
   npm run db:seed               # optional: demo data (see below)
   npm run dev                   # http://localhost:4000
   ```

2. Frontend (new terminal):

   ```bash
   cd frontend
   cp .env.example .env          # optional: code defaults already point at localhost:4000
   npm install
   npm run dev                   # http://localhost:3000
   ```

Sanity check: `curl http://localhost:4000/health` →
`{"data":{"status":"ok","database":"connected",...}}` (503 + `"degraded"`
if the database is unreachable).

### Seed data

The seed **wipes all data** (tasks, columns, memberships, boards, users — in
FK order) and inserts:

- `alice@example.com` / `password123` — owner of the board "Project Launch"
- `bob@example.com` / `password123` — member of that board
- 3 columns (To Do, In Progress, Done) and 5 tasks

Passwords are hashed with the app's own bcrypt helper, so both accounts can
log in immediately.

## Environment Variables

Three env files, each with a committed `.env.example`. Nothing secret is
committed. Compose injects its own values into the containers, so
`backend/.env` is only read when the backend runs on the host.

**`backend/.env`** — sample:

```env
NODE_ENV=development
PORT=4000
API_PREFIX=/api
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/get_it_done?schema=public
JWT_SECRET=<32-byte random hex — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRES_IN=1h
JWT_COOKIE_NAME=access_token
```

`DATABASE_URL` and `JWT_SECRET` are required (startup fails without them).
`JWT_EXPIRES_IN` uses the jsonwebtoken format (`30m`, `1h`, `7d`).

**`frontend/.env`** — entirely optional; the code has the same defaults
built in (`frontend/src/lib/config.ts`). Sample:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_PREFIX=/api
```

`NEXT_PUBLIC_*` variables are inlined into the browser bundle at build time,
so changing them requires a rebuild (or dev-server restart).

**Root `.env`** — read by docker-compose only. Sample:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=get_it_done
POSTGRES_PORT=5432
JWT_SECRET=<required — compose refuses to start without it>
JWT_EXPIRES_IN=1h
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_PREFIX=/api
```

If mixing host-run backend with compose-run Postgres, make sure
`DATABASE_URL` matches `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`.

## API

Full reference with request/response shapes and error codes:
**[`docs/API.md`](docs/API.md)**.

Conventions in short: success is `{ "data": { ... } }`, failure is
`{ "error": { "code", "message" } }`, deletes return `204`. All endpoints
except register/login/logout require the session cookie.

A quick curl walkthrough (register two users, share a board, move a task):

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

`./scripts/smoke-test.sh` runs a longer end-to-end walk-through (auth →
boards → sharing → authorization denials → movement) against a live backend.

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

Database commands (`backend/`): `npm run prisma:migrate` (dev),
`npx prisma migrate deploy` (apply committed migrations), `npm run db:seed`,
`npm run db:reset` (drop + re-migrate + re-seed).

Backend tests mock the Prisma layer, so they need no database and no
`JWT_SECRET`. New migrations are authored from the host workflow against a
reachable database, then applied elsewhere with `migrate deploy`.

## Design Highlights

The choices a reviewer is most likely to probe:

- **Auth**: single JWT in an httpOnly cookie (`SameSite=Lax`, `Secure` in
  production, 1h). No refresh token and no server-side revocation — logout
  clears the cookie only; a stolen cookie is valid until expiry. Login is
  enumeration-resistant (identical `401` for unknown email vs wrong
  password). Deliberate scope cut for this threat model.
- **Authorization** is derived from the database only, never from request
  bodies. Owners manage the board and its members; members have full content
  rights (columns, tasks, moves) but can't rename/delete the board or manage
  members. Ids from other boards resolve to `404`, never to data
  (cross-tenant safety, re-verified inside the services).
- **Task ordering**: positions are zero-based, contiguous integers
  (`0..n-1`) with DB-enforced uniqueness (`@@unique([columnId, position])`).
  An ordering bug is a constraint violation, not silent corruption. Positions
  are server-assigned and never accepted from the client; edits cannot
  reorder — only `PATCH /api/tasks/:taskId/move` can.
- **Movement algorithm**: one transaction — lock the affected column rows
  `FOR UPDATE` in sorted-id order (no deadlocks), read positions after the
  lock, "park" the moved task at `-1`, shift siblings one row at a time in
  collision-free order, then write the final position. Every intermediate
  state is constraint-valid, so no deferrable constraints are needed.
  Out-of-range positions are rejected (`400`), not clamped. Creates and
  deletes use the same lock discipline; deletes close the gap in the same
  transaction. Contention retries surface as `409`.
- **Membership**: one owner (no membership row; access from ownership) plus
  single-level members, shared by email of an already-registered user (no
  mail infrastructure). The board detail response lists the owner first, so
  there's a single roster endpoint.
- **Deliberately simple architecture**: Express service layer, no queue, no
  cache, no WebSockets, no pagination, no ORM tricks beyond explicit
  transactions. The interesting complexity is concentrated where the problem
  actually is: concurrent ordering. Known gaps (no rate limiting, no email
  verification, no refresh tokens) are intentional and listed here rather
  than hidden.

## Security Summary

- bcrypt (12 rounds); hashes never leave the service layer.
- httpOnly cookie + `helmet()` + CORS allowlist with credentials; JSON
  bodies capped at 1 MB; every body validated with Zod at the boundary.
- Unexpected errors are logged server-side but return a generic message in
  production — no stack traces leak.
- Containers: multi-stage builds, non-root users, healthchecks; the runtime
  image excludes dev dependencies and the Prisma CLI.
- Deployment notes: run migrations explicitly (`migrate deploy`) before
  rolling new API versions, never at app startup; `JWT_SECRET` must come
  from the environment (compose fails fast if missing); put the app behind
  TLS in production (the cookie is `Secure` then); only PostgreSQL holds
  state, so the API containers are stateless and a managed database just
  needs its connection string in `DATABASE_URL`.
