# Get It Done — API Reference

Base URL: `http://localhost:4000/api` (see `API_PREFIX` in `backend/.env.example`).

## Authentication

The API uses an httpOnly JWT session cookie (`access_token`, `SameSite=Lax`,
`Secure` in production). All endpoints except `register` and `login` require it;
requests without a valid, unexpired cookie get `401`.

```
POST /api/auth/register   { name, email, password }        -> 201 { data: { user } }
POST /api/auth/login      { email, password }              -> 200 { data: { user } } + Set-Cookie
GET  /api/auth/me         (cookie)                         -> 200 { data: { user } }
```

`user` never contains the password hash. Unknown email and wrong password
return the same generic `401` (no account enumeration).

## Response envelope

Success: `{ "data": { ... } }`. Failure: `{ "error": { "code", "message", "details?" } }`.
Deletes return `204` with no body.

## Boards

| Method | Path                                   | Access    | Description |
|--------|----------------------------------------|-----------|-------------|
| POST   | `/boards`                              | auth      | Create a board (caller becomes owner). Body: `{ title }` |
| GET    | `/boards`                              | auth      | Boards the user owns or is a member of, with `role` |
| GET    | `/boards/:boardId`                     | read      | Board detail incl. members |
| PATCH  | `/boards/:boardId`                     | owner     | Rename. Body: `{ title }` |
| DELETE | `/boards/:boardId`                     | owner     | Delete board (cascades members/columns/tasks) |
| POST   | `/boards/:boardId/members`             | owner     | Share board. Body: `{ email }` (must be a registered user) |
| DELETE | `/boards/:boardId/members/:userId`     | owner     | Revoke a member's access immediately |

Access levels: **auth** = any logged-in user, **read** = owner or member,
**owner** = board owner only. Unknown board ids return `404`; access denial
returns `403` — existence is never leaked across boards.

## Columns

| Method | Path                                            | Access | Description |
|--------|-------------------------------------------------|--------|-------------|
| POST   | `/boards/:boardId/columns`                      | member | Append column. Body: `{ title }` — position is server-assigned |
| GET    | `/boards/:boardId/columns`                      | member | Columns ordered by `position` (contiguous `0..n-1`) |
| PATCH  | `/boards/:boardId/columns/:columnId`            | member | Rename. Body: `{ title }` |
| DELETE | `/boards/:boardId/columns/:columnId`            | member | Delete column and its tasks; positions re-close |

("member" = owner or board member.) A `columnId` from another board is `404`.

## Tasks

| Method | Path                                  | Access | Description |
|--------|---------------------------------------|--------|-------------|
| POST   | `/columns/:columnId/tasks`            | member | Append task. Body: `{ title, description? }` — position is server-assigned |
| GET    | `/columns/:columnId/tasks`            | member | Tasks ordered by `position` |
| GET    | `/tasks/:taskId`                      | member | Fetch one task |
| PATCH  | `/tasks/:taskId`                      | member | Edit. Body: `{ title?, description? }` — cannot change position/column here |
| DELETE | `/tasks/:taskId`                      | member | Delete task; positions re-close |
| PATCH  | `/tasks/:taskId/move`                 | member | Move within/between columns |

### Task movement

```
PATCH /api/tasks/:taskId/move
{ "targetColumnId": "col_...", "targetPosition": 2 }
```

Returns `{ data: { task, sourceColumn, destinationColumn } }` where the column
objects carry the full post-move ordering (`{ id, tasks: [{ id, position }] }`).

Rules:
- `targetPosition` is a zero-based index; out-of-range is **rejected** (`400`),
  not clamped: same-column moves accept `0..n-1`, cross-column `0..m`.
- The target column must belong to the same board as the task (`404` otherwise).
- The move runs in a single transaction with `SELECT ... FOR UPDATE` locks on
  the affected columns; concurrent relocations are retried and surface as
  `409 CONFLICT` under extreme contention.
- Invariant: after every move, each column's positions are exactly `0..n-1`.

## Error codes

| HTTP | `error.code`       | Meaning |
|------|--------------------|---------|
| 400  | `VALIDATION_ERROR` | Invalid/missing fields (`details.fields` lists them) |
| 400  | `INVALID_JSON`     | Malformed JSON body |
| 401  | `UNAUTHORIZED`     | Missing/invalid/expired session |
| 403  | `FORBIDDEN`        | Authenticated but no access to the resource |
| 404  | `NOT_FOUND` / `ROUTE_NOT_FOUND` | Unknown resource/route |
| 409  | `CONFLICT`         | Duplicate email/membership, owner-as-member, move contention |
| 413  | `PAYLOAD_TOO_LARGE`| Body over the size limit |
| 500  | `INTERNAL_ERROR`   | Unexpected failure (details hidden in production) |

## Misc

```
GET /health   -> 200 { data: { status, database, uptime, timestamp } }
              -> 503 when the database is unreachable
```
