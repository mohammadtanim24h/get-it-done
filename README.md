# Get It Done

A full-stack mini Kanban board application — a technical assessment project.

## Stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + Prisma ORM (planned)
- **DevOps:** Docker + docker-compose

## Status

Phase 1 — project scaffolding complete. No business functionality yet; the
backend exposes a single `GET /health` endpoint and the frontend renders a
placeholder page.

## Project Structure

```
get-it-done/
├── frontend/          # Next.js web client
│   └── src/
│       ├── app/           # App Router pages/layouts
│       ├── components/    # Reusable UI components
│       ├── hooks/         # Custom React hooks
│       ├── lib/           # Utilities
│       ├── providers/     # Client-side provider composition
│       ├── services/      # Centralized API client & auth helpers
│       └── types/         # Shared frontend types
├── backend/           # Express API
│   └── src/
│       ├── config/        # Environment & app configuration
│       ├── controllers/   # HTTP handlers
│       ├── middleware/    # Express middleware (errors, auth, ...)
│       ├── routes/        # Route definitions
│       ├── services/      # Business logic
│       ├── validators/    # Request validation
│       ├── lib/           # Utilities
│       ├── types/         # Shared API types
│       ├── app.ts         # Express app setup
│       └── server.ts      # HTTP server entrypoint
└── docker-compose.yml # Local infrastructure (PostgreSQL; more to come)
```

## Getting Started

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # starts on http://localhost:4000
```

Health check: `curl http://localhost:4000/health`

### Frontend

```bash
cd frontend
npm install
npm run dev          # starts on http://localhost:3000
```

### Database (PostgreSQL via Docker)

The database runs in Docker while the backend and frontend run directly on
the host. Docker Compose reads optional overrides from a `.env` file in the
repo root:

```bash
# .env (repo root) — optional, these are the defaults
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=get_it_done
POSTGRES_PORT=5432
```

Start PostgreSQL and wait for it to become healthy:

```bash
docker compose up -d postgres
docker compose ps        # STATUS should show "healthy"
```

Then, from `backend/` (with `backend/.env` copied from `.env.example`):
apply migrations and seed the database:

```bash
cd backend
cp .env.example .env       # if not done already
npm run prisma:migrate     # prisma migrate dev
npm run db:seed            # prisma db seed
```

`backend/.env` must contain a `DATABASE_URL` whose user, password, port, and
database name match the compose variables above.

## Full Stack with Docker

The entire application (PostgreSQL + backend + frontend) runs via
docker-compose:

```bash
cp .env.example .env
# generate a JWT secret and set JWT_SECRET in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose build
docker compose up -d
docker compose ps     # postgres, migrate (exited 0), backend, frontend healthy
```

Then open http://localhost:3000 (frontend) and http://localhost:4000/health
(backend).

### Migrations

Migrations are applied by a dedicated one-shot `migrate` container running
`prisma migrate deploy` — application startup never migrates. Compose runs it
automatically before the backend starts. To apply/seed manually:

```bash
docker compose run --rm migrate                      # prisma migrate deploy
docker compose run --rm migrate npx prisma db seed   # seed the database
```

To create a new migration during development, use the host workflow
(`cd backend && npm run prisma:migrate` with a reachable database), then
rebuild: `docker compose build migrate`.

### Environment / secrets

All credentials come from the root `.env` file (see `.env.example`). Nothing
secret is committed. `NEXT_PUBLIC_API_URL` is a Docker build arg because
Next.js inlines `NEXT_PUBLIC_*` variables at build time; the value must be the
URL the browser uses to reach the backend (default `http://localhost:4000`).

### Useful commands

```bash
docker compose logs -f backend     # follow API logs
docker compose down                # stop (data persists in postgres-data volume)
docker compose down -v             # stop and DELETE all database data
```

## Planned Architecture

- REST API with layered backend (routes → controllers → services → Prisma)
- JWT-based authentication with protected board/task endpoints
- Kanban board UI with drag-and-drop columns and tasks
- Dockerized deployments for API, web, and database
