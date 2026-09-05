#!/usr/bin/env bash
# End-to-end smoke test: walks the full user journey against a RUNNING
# backend (default http://localhost:4000) using curl and cookie jars, the
# same way a browser would. Requires a migrated database.
#
# Usage:
#   ./scripts/smoke-test.sh              # against http://localhost:4000
#   API_BASE=http://host:port ./scripts/smoke-test.sh
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4000/api}"
STAMP="$(date +%s)"
OWNER_EMAIL="smoke-owner-$STAMP@example.com"
MEMBER_EMAIL="smoke-member-$STAMP@example.com"
OUTSIDER_EMAIL="smoke-outsider-$STAMP@example.com"
PASSWORD="smoke-password-1"

OWNER_JAR="$(mktemp)"; MEMBER_JAR="$(mktemp)"; OUTSIDER_JAR="$(mktemp)"
trap 'rm -f "$OWNER_JAR" "$MEMBER_JAR" "$OUTSIDER_JAR"' EXIT

STEP=0
step() { STEP=$((STEP + 1)); printf '\n[%02d] %s\n' "$STEP" "$1"; }

# api <jar> <method> <path> [json-body] -> sets STATUS and BODY
api() {
  local jar="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$API_BASE$path"
    -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000'
    --max-time 10)
  [[ -n "$jar" ]] && args+=(-b "$jar" -c "$jar")
  [[ -n "$body" ]] && args+=(-d "$body")
  STATUS="$(curl "${args[@]}")"
}

json() {
  node -e 'let c = JSON.parse(process.argv[1]); for (const k of process.argv[2].split(".")) c = c?.[k]; console.log(typeof c === "object" ? JSON.stringify(c) : c);' "$1" "$2"
}

expect() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  ok: $label ($actual)"
  else
    echo "  FAIL: $label — expected $expected, got $actual" >&2
    exit 1
  fi
}

step "Register owner, member, outsider"
api "" POST /auth/register "{\"name\":\"Smoke Owner\",\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}"
expect 201 "$STATUS" "owner registers"
api "" POST /auth/register "{\"name\":\"Smoke Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\"}"
expect 201 "$STATUS" "member registers"
api "" POST /auth/register "{\"name\":\"Smoke Outsider\",\"email\":\"$OUTSIDER_EMAIL\",\"password\":\"$PASSWORD\"}"
expect 201 "$STATUS" "outsider registers"

step "Login as owner"
RESP="$(curl -s -c "$OWNER_JAR" -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}" "$API_BASE/auth/login")"
expect "$OWNER_EMAIL" "$(json "$RESP" data.user.email)" "owner login returns user"

step "Create board"
RESP="$(curl -s -b "$OWNER_JAR" -c "$OWNER_JAR" -H 'Content-Type: application/json' \
  -d '{"title":"Smoke Board"}' "$API_BASE/boards")"
expect "Smoke Board" "$(json "$RESP" data.board.title)" "board created"
BOARD_ID="$(json "$RESP" data.board.id)"

step "Create columns"
RESP="$(curl -s -b "$OWNER_JAR" -H 'Content-Type: application/json' \
  -d '{"title":"Todo"}' "$API_BASE/boards/$BOARD_ID/columns")"
COL_TODO="$(json "$RESP" data.column.id)"
RESP="$(curl -s -b "$OWNER_JAR" -H 'Content-Type: application/json' \
  -d '{"title":"Doing"}' "$API_BASE/boards/$BOARD_ID/columns")"
COL_DOING="$(json "$RESP" data.column.id)"

step "Create tasks in Todo"
TASK_IDS=()
for title in "Task A" "Task B" "Task C"; do
  RESP="$(curl -s -b "$OWNER_JAR" -H 'Content-Type: application/json' \
    -d "{\"title\":\"$title\"}" "$API_BASE/columns/$COL_TODO/tasks")"
  TASK_IDS+=("$(json "$RESP" data.task.id)")
done

step "Reorder task within column (C -> position 0)"
api "$OWNER_JAR" PATCH "/tasks/${TASK_IDS[2]}/move" "{\"targetColumnId\":\"$COL_TODO\",\"targetPosition\":0}"
expect 200 "$STATUS" "move within column"

step "Move task across columns (A -> Doing position 0)"
api "$OWNER_JAR" PATCH "/tasks/${TASK_IDS[0]}/move" "{\"targetColumnId\":\"$COL_DOING\",\"targetPosition\":0}"
expect 200 "$STATUS" "move across columns"

step "Edit task"
api "$OWNER_JAR" PATCH "/tasks/${TASK_IDS[1]}" '{"title":"Task B edited","description":"updated"}'
expect 200 "$STATUS" "edit task"

step "Delete task"
api "$OWNER_JAR" DELETE "/tasks/${TASK_IDS[2]}"
expect 204 "$STATUS" "delete task"

step "Share board with member"
curl -s -c "$MEMBER_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\"}" "$API_BASE/auth/login" > /dev/null
RESP="$(curl -s -b "$OWNER_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MEMBER_EMAIL\"}" "$API_BASE/boards/$BOARD_ID/members")"
expect "$MEMBER_EMAIL" "$(json "$RESP" data.member.email)" "member added"
MEMBER_USER_ID="$(json "$RESP" data.member.userId)"

step "Member can work on the board"
api "$MEMBER_JAR" GET "/boards/$BOARD_ID"
expect 200 "$STATUS" "member reads board"
api "$MEMBER_JAR" POST "/columns/$COL_DOING/tasks" '{"title":"Member task"}'
expect 201 "$STATUS" "member creates task"
api "$MEMBER_JAR" PATCH "/tasks/${TASK_IDS[0]}/move" "{\"targetColumnId\":\"$COL_TODO\",\"targetPosition\":0}"
expect 200 "$STATUS" "member moves task"

step "Unrelated user cannot access the board"
curl -s -c "$OUTSIDER_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OUTSIDER_EMAIL\",\"password\":\"$PASSWORD\"}" "$API_BASE/auth/login" > /dev/null
api "$OUTSIDER_JAR" GET "/boards/$BOARD_ID"
expect 403 "$STATUS" "outsider blocked from board"
api "$OUTSIDER_JAR" GET "/columns/$COL_TODO/tasks"
expect 403 "$STATUS" "outsider blocked from tasks"

step "Remove member"
api "$OWNER_JAR" DELETE "/boards/$BOARD_ID/members/$MEMBER_USER_ID"
expect 204 "$STATUS" "member removed"

step "Removed member loses access"
api "$MEMBER_JAR" GET "/boards/$BOARD_ID"
expect 403 "$STATUS" "removed member blocked from board"
api "$MEMBER_JAR" GET "/columns/$COL_TODO/tasks"
expect 403 "$STATUS" "removed member blocked from tasks"

step "Ordering integrity after the journey"
RESP="$(curl -s -b "$OWNER_JAR" "$API_BASE/columns/$COL_TODO/tasks")"
expect "0,1" "$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.data.tasks.map(t=>t.position).join(','));" "$RESP")" "Todo positions contiguous"

printf '\nAll %d steps passed.\n' "$STEP"
