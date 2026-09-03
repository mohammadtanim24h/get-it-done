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

### Database

```bash
docker compose up -d postgres
```

## Planned Architecture

- REST API with layered backend (routes → controllers → services → Prisma)
- JWT-based authentication with protected board/task endpoints
- Kanban board UI with drag-and-drop columns and tasks
- Dockerized deployments for API, web, and database
