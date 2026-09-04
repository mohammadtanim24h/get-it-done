import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-memory stand-in for Prisma models used by the task movement endpoint.
// $transaction runs its callback against the same in-memory mock, so the
// interactive-transaction code path behaves like the real client.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    board: { findUnique: vi.fn() },
    boardMember: { findUnique: vi.fn() },
    column: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { createApp } from '../src/app';

const mockedBoardFindUnique = vi.mocked(prisma.board.findUnique);
const mockedColumnFindUnique = vi.mocked(prisma.column.findUnique);
const mockedTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockedTaskFindUniqueOrThrow = vi.mocked(prisma.task.findUniqueOrThrow);
const mockedTaskFindMany = vi.mocked(prisma.task.findMany);
const mockedTaskUpdate = vi.mocked(prisma.task.update);
const mockedTaskUpdateMany = vi.mocked(prisma.task.updateMany);
const mockedQueryRaw = vi.mocked(prisma.$queryRaw);
const mockedTransaction = vi.mocked(prisma.$transaction);

const TEST_JWT_SECRET = env.jwtSecret;
const COOKIE_NAME = env.jwtCookieName;

interface TestUser {
  id: string;
  name: string;
  email: string;
}

interface TestBoard {
  id: string;
  title: string;
  ownerId: string;
}

interface TestMember {
  boardId: string;
  userId: string;
}

interface TestColumn {
  id: string;
  title: string;
  position: number;
  boardId: string;
}

interface TestTask {
  id: string;
  title: string;
  description: string;
  position: number;
  columnId: string;
}

const db = {
  boards: [] as TestBoard[],
  members: [] as TestMember[],
  columns: [] as TestColumn[],
  tasks: [] as TestTask[],
};

const OWNER: TestUser = { id: 'user-owner', name: 'Olivia Owner', email: 'owner@example.com' };
const MEMBER: TestUser = { id: 'user-member', name: 'Mike Member', email: 'member@example.com' };
const OUTSIDER: TestUser = { id: 'user-outsider', name: 'Oscar Outsider', email: 'outsider@example.com' };

const addBoard = (id: string, title: string, ownerId: string): TestBoard => {
  const board: TestBoard = { id, title, ownerId };
  db.boards.push(board);
  return board;
};

const addMember = (boardId: string, userId: string): void => {
  if (!db.members.some((m) => m.boardId === boardId && m.userId === userId)) {
    db.members.push({ boardId, userId });
  }
};

const addColumn = (boardId: string, id: string, title: string, position: number): TestColumn => {
  const column: TestColumn = { id, title, position, boardId };
  db.columns.push(column);
  return column;
};

const addTask = (columnId: string, id: string, title: string, position: number): TestTask => {
  const task: TestTask = { id, title, description: '', position, columnId };
  db.tasks.push(task);
  return task;
};

const signToken = (user: TestUser): string =>
  jwt.sign({ email: user.email }, TEST_JWT_SECRET, { subject: user.id, expiresIn: '1h' });

const authCookie = (user: TestUser): string => `${COOKIE_NAME}=${signToken(user)}`;

/** Business invariant: positions in a column are exactly [0, 1, ..., n-1]. */
const columnTasks = (columnId: string): TestTask[] =>
  db.tasks.filter((t) => t.columnId === columnId).sort((a, b) => a.position - b.position);

const expectContiguous = (columnId: string): void => {
  const tasks = columnTasks(columnId);
  expect(tasks.map((t) => t.position)).toEqual(tasks.map((_, i) => i));
};

/** Invariant across every column in the in-memory DB. */
const expectAllColumnsContiguous = (): void => {
  for (const column of db.columns) expectContiguous(column.id);
};

const moveTaskRequest = (taskId: string, user: TestUser, body: unknown) =>
  request(createApp())
    .patch(`/api/tasks/${taskId}/move`)
    .set('Cookie', authCookie(user))
    .send(body);

// Standard fixture: one board, Todo (4 tasks) + Doing (2 tasks).
const setupBoard = (): void => {
  addBoard('board-1', 'Project', OWNER.id);
  addColumn('board-1', 'col-todo', 'Todo', 0);
  addColumn('board-1', 'col-doing', 'Doing', 1);
  addTask('col-todo', 'task-a', 'A', 0);
  addTask('col-todo', 'task-b', 'B', 1);
  addTask('col-todo', 'task-c', 'C', 2);
  addTask('col-todo', 'task-d', 'D', 3);
  addTask('col-doing', 'task-x', 'X', 0);
  addTask('col-doing', 'task-y', 'Y', 1);
};

const todoOrder = () => columnTasks('col-todo').map((t) => t.id);

beforeEach(() => {
  db.boards.length = 0;
  db.members.length = 0;
  db.columns.length = 0;
  db.tasks.length = 0;

  mockedBoardFindUnique.mockReset();
  mockedColumnFindUnique.mockReset();
  mockedTaskFindUnique.mockReset();
  mockedTaskFindUniqueOrThrow.mockReset();
  mockedTaskFindMany.mockReset();
  mockedTaskUpdate.mockReset();
  mockedTaskUpdateMany.mockReset();
  mockedQueryRaw.mockReset();
  mockedTransaction.mockReset();

  mockedTransaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  mockedQueryRaw.mockResolvedValue([]);

  mockedBoardFindUnique.mockImplementation(
    async (args: { where: { id: string }; select?: { members?: { where: { userId: string } } } }) => {
      const board = db.boards.find((b) => b.id === args.where.id);
      if (!board) return null;
      if (args.select?.members) {
        const userId = args.select.members.where.userId;
        return {
          id: board.id,
          ownerId: board.ownerId,
          members: db.members.some((m) => m.boardId === board.id && m.userId === userId) ? [{ id: `${board.id}-${userId}` }] : [],
        };
      }
      return board;
    },
  );

  mockedColumnFindUnique.mockImplementation(async (args: { where: { id: string }; select?: object }) => {
    const column = db.columns.find((c) => c.id === args.where.id);
    if (!column) return null;
    if ('boardId' in (args.select ?? {})) {
      return { boardId: column.boardId };
    }
    return column;
  });

  mockedTaskFindUnique.mockImplementation(
    async (args: {
      where: { id: string };
      select?: { column?: unknown };
      include?: { column?: unknown };
    }) => {
      const task = db.tasks.find((t) => t.id === args.where.id);
      if (!task) return null;
      const stamp = { createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
      if (args.select?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { column: { boardId: column?.boardId ?? '' } };
      }
      if (args.include?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { ...task, ...stamp, column: column ? { ...column, ...stamp } : null };
      }
      return { ...task, ...stamp };
    },
  );

  mockedTaskFindUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const task = db.tasks.find((t) => t.id === where.id);
    if (!task) throw Object.assign(new Error('not found'), { code: 'P2025' });
    return { ...task, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
  });

  mockedTaskFindMany.mockImplementation(
    async (args: { where: { columnId: string }; orderBy?: { position: 'asc' | 'desc' } }) => {
      const tasks = db.tasks.filter((t) => t.columnId === args.where.columnId);
      const order = args.orderBy?.position ?? 'asc';
      return [...tasks]
        .sort((a, b) => (order === 'desc' ? b.position - a.position : a.position - b.position))
        .map((t) => ({ ...t, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') }));
    },
  );

  mockedTaskUpdate.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { title?: string; description?: string; position?: number; columnId?: string };
    }) => {
      const task = db.tasks.find((t) => t.id === where.id);
      if (!task) throw Object.assign(new Error('not found'), { code: 'P2025' });
      if (data.title !== undefined) task.title = data.title;
      if (data.description !== undefined) task.description = data.description;
      if (data.position !== undefined) task.position = data.position;
      if (data.columnId !== undefined) task.columnId = data.columnId;
      return { ...task, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-04-01T00:00:00.000Z') };
    },
  );

  const matchesPosition = (
    position: number,
    filter?: { gt?: number; gte?: number; lt?: number; lte?: number },
  ): boolean =>
    (filter?.gt === undefined || position > filter.gt) &&
    (filter?.gte === undefined || position >= filter.gte) &&
    (filter?.lt === undefined || position < filter.lt) &&
    (filter?.lte === undefined || position <= filter.lte);

  mockedTaskUpdateMany.mockImplementation(
    async (args: {
      where: { columnId: string; position?: { gt?: number; gte?: number; lt?: number; lte?: number } };
      data: { position?: { increment?: number; decrement?: number } };
    }) => {
      const matching = db.tasks.filter(
        (t) => t.columnId === args.where.columnId && matchesPosition(t.position, args.where.position),
      );
      for (const task of matching) {
        if (args.data.position?.increment !== undefined) task.position += args.data.position.increment;
        if (args.data.position?.decrement !== undefined) task.position -= args.data.position.decrement;
      }
      return { count: matching.length };
    },
  );
});

describe('PATCH /api/tasks/:taskId/move — same column', () => {
  it('moves a task down within the same column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: 'task-a', position: 2, columnId: 'col-todo' });
    expect(todoOrder()).toEqual(['task-b', 'task-c', 'task-a', 'task-d']);
    expectAllColumnsContiguous();
  });

  it('moves a task up within the same column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-c', OWNER, { targetColumnId: 'col-todo', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(todoOrder()).toEqual(['task-c', 'task-a', 'task-b', 'task-d']);
    expectAllColumnsContiguous();
  });

  it('moves the first task to last', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: 3 });

    expect(res.status).toBe(200);
    expect(todoOrder()).toEqual(['task-b', 'task-c', 'task-d', 'task-a']);
    expectAllColumnsContiguous();
  });

  it('moves the last task to first', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-d', OWNER, { targetColumnId: 'col-todo', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(todoOrder()).toEqual(['task-d', 'task-a', 'task-b', 'task-c']);
    expectAllColumnsContiguous();
  });

  it('accepts a move to the end of the same column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-b', OWNER, { targetColumnId: 'col-todo', targetPosition: 3 });

    expect(res.status).toBe(200);
    expect(todoOrder()).toEqual(['task-a', 'task-c', 'task-d', 'task-b']);
    expectAllColumnsContiguous();
  });

  it('treats a move to the current position as a valid no-op', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-b', OWNER, { targetColumnId: 'col-todo', targetPosition: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: 'task-b', position: 1 });
    expect(todoOrder()).toEqual(['task-a', 'task-b', 'task-c', 'task-d']);
    expectAllColumnsContiguous();
  });

  it('returns the moved task plus the full column ordering for the frontend', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.sourceColumn).toEqual({
      id: 'col-todo',
      tasks: [
        { id: 'task-b', position: 0 },
        { id: 'task-a', position: 1 },
        { id: 'task-c', position: 2 },
        { id: 'task-d', position: 3 },
      ],
    });
    // Same-column move: source and destination are the same column.
    expect(res.body.data.destinationColumn).toEqual(res.body.data.sourceColumn);
  });

  it('shifts sibling rows in collision-free order (descending when incrementing)', async () => {
    setupBoard();

    // Move task-d (pos 3) to position 0: siblings a,b,c (positions 0-2)
    // must be incremented in DESCENDING position order (c, b, a) so no
    // single-row update ever lands on a position another row still holds.
    await moveTaskRequest('task-d', OWNER, { targetColumnId: 'col-todo', targetPosition: 0 });

    const siblingWrites = mockedTaskUpdate.mock.calls
      .map((call) => call[0] as { where: { id: string }; data: { position?: number } })
      .filter((call) => ['task-a', 'task-b', 'task-c'].includes(call.where.id))
      .map((call) => ({ id: call.where.id, to: call.data.position }));
    expect(siblingWrites).toEqual([
      { id: 'task-c', to: 3 },
      { id: 'task-b', to: 2 },
      { id: 'task-a', to: 1 },
    ]);
    expectAllColumnsContiguous();
  });
});

describe('PATCH /api/tasks/:taskId/move — cross column', () => {
  const doingOrder = () => columnTasks('col-doing').map((t) => t.id);

  it('moves a task into the middle of another column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-b', OWNER, { targetColumnId: 'col-doing', targetPosition: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: 'task-b', position: 1, columnId: 'col-doing' });
    expect(todoOrder()).toEqual(['task-a', 'task-c', 'task-d']);
    expect(doingOrder()).toEqual(['task-x', 'task-b', 'task-y']);
    expectAllColumnsContiguous();
  });

  it('moves a task into an empty column at index 0', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-todo', 'Todo', 0);
    addColumn('board-1', 'col-done', 'Done', 1);
    addTask('col-todo', 'task-a', 'A', 0);
    addTask('col-todo', 'task-b', 'B', 1);

    const res = await moveTaskRequest('task-b', OWNER, { targetColumnId: 'col-done', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: 'task-b', position: 0, columnId: 'col-done' });
    expect(columnTasks('col-todo').map((t) => t.id)).toEqual(['task-a']);
    expect(columnTasks('col-done').map((t) => t.id)).toEqual(['task-b']);
    expectAllColumnsContiguous();
  });

  it('moves a task to index 0 of a non-empty column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-c', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(doingOrder()).toEqual(['task-c', 'task-x', 'task-y']);
    expectAllColumnsContiguous();
  });

  it('moves a task to the end of another column (position == count)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 2 });

    expect(res.status).toBe(200);
    expect(doingOrder()).toEqual(['task-x', 'task-y', 'task-a']);
    expectAllColumnsContiguous();
  });

  it('returns both columns’ orderings in the response', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-d', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.sourceColumn).toEqual({
      id: 'col-todo',
      tasks: [
        { id: 'task-a', position: 0 },
        { id: 'task-b', position: 1 },
        { id: 'task-c', position: 2 },
      ],
    });
    expect(res.body.data.destinationColumn).toEqual({
      id: 'col-doing',
      tasks: [
        { id: 'task-d', position: 0 },
        { id: 'task-x', position: 1 },
        { id: 'task-y', position: 2 },
      ],
    });
  });
});

describe('PATCH /api/tasks/:taskId/move — validation and authorization', () => {
  it('returns 404 for a non-existent task', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-todo', 'Todo', 0);

    const res = await moveTaskRequest('nope', OWNER, { targetColumnId: 'col-todo', targetPosition: 0 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a non-existent target column', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'nope', targetPosition: 0 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(todoOrder()).toEqual(['task-a', 'task-b', 'task-c', 'task-d']);
  });

  it('returns 404 (not 403) when the target column belongs to another board', async () => {
    setupBoard();
    addBoard('board-2', 'Foreign', OUTSIDER.id);
    addColumn('board-2', 'col-foreign', 'Foreign column', 0);

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-foreign', targetPosition: 0 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(db.tasks.find((t) => t.id === 'task-a')!).toMatchObject({ columnId: 'col-todo', position: 0 });
  });

  it('blocks a user without access to the board (403, no mutation)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OUTSIDER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedQueryRaw).not.toHaveBeenCalled();
    expect(mockedTaskUpdate).not.toHaveBeenCalled();
    expectAllColumnsContiguous();
  });

  it('lets a board member move tasks', async () => {
    setupBoard();
    addMember('board-1', MEMBER.id);

    const res = await moveTaskRequest('task-a', MEMBER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(200);
    expect(columnTasks('col-doing').map((t) => t.id)).toEqual(['task-a', 'task-x', 'task-y']);
    expect(todoOrder()).toEqual(['task-b', 'task-c', 'task-d']);
    expectAllColumnsContiguous();
  });

  it('returns 401 when not authenticated', async () => {
    setupBoard();

    const res = await request(createApp())
      .patch('/api/tasks/task-a/move')
      .send({ targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(401);
  });

  it('rejects a negative targetPosition (400)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-integer targetPosition (400)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-number targetPosition (400)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: '2' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing targetColumnId (400)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetPosition: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty body (400)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, {});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a same-column move beyond the last index (documented: reject, not clamp)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-todo', targetPosition: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(todoOrder()).toEqual(['task-a', 'task-b', 'task-c', 'task-d']);
  });

  it('rejects a cross-column move beyond the destination count (documented: reject, not clamp)', async () => {
    setupBoard();

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectAllColumnsContiguous();
    expect(todoOrder()).toEqual(['task-a', 'task-b', 'task-c', 'task-d']);
    expect(columnTasks('col-doing').map((t) => t.id)).toEqual(['task-x', 'task-y']);
  });
});

describe('PATCH /api/tasks/:taskId/move — invariants, atomicity, locking', () => {
  it('keeps positions contiguous through repeated movements', async () => {
    setupBoard();

    const moves: Array<[string, string, number]> = [
      ['task-a', 'col-doing', 0],
      ['task-d', 'col-doing', 2],
      ['task-c', 'col-todo', 0],
      ['task-x', 'col-todo', 2],
      ['task-b', 'col-doing', 3],
      ['task-y', 'col-todo', 0],
      ['task-a', 'col-todo', 3],
      ['task-x', 'col-doing', 1],
    ];

    for (const [taskId, columnId, position] of moves) {
      const res = await moveTaskRequest(taskId, OWNER, { targetColumnId: columnId, targetPosition: position });
      expect(res.status).toBe(200);
      // Business invariant after EVERY operation: every column holds
      // exactly the position sequence [0, 1, ..., n-1].
      expectAllColumnsContiguous();
    }

    expect(db.tasks).toHaveLength(6);
  });

  it('runs the whole move inside a single transaction', async () => {
    setupBoard();

    await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it('locks the affected column rows FOR UPDATE before reordering', async () => {
    setupBoard();

    await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(mockedQueryRaw).toHaveBeenCalledTimes(1);
    // Tagged-template call: first argument is the SQL string chunks.
    const sql = (mockedQueryRaw.mock.calls[0]![0] as readonly string[]).join('§');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"Column"');
  });

  it('never writes the moved task to a position another task holds (parking sentinel shifts first)', async () => {
    setupBoard();

    await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    // The first write for the moved task must move it off the grid (to
    // the -1 parking position) before siblings shift; final write lands
    // it on its real position.
    const movedWrites = mockedTaskUpdate.mock.calls.filter(
      (call) => (call[0] as { where: { id: string } }).where.id === 'task-a',
    );
    expect(movedWrites.length).toBeGreaterThanOrEqual(2);
    expect((movedWrites[0]![0] as { data: { position?: number } }).data.position).toBe(-1);
    const lastWrite = movedWrites[movedWrites.length - 1]![0] as { data: { position?: number } };
    expect(lastWrite.data.position).toBe(0);
    expectAllColumnsContiguous();
  });

  it('retries with fresh state when a concurrent move relocates the task before the lock', async () => {
    setupBoard();
    // Simulate a competing transaction moving task-a to col-doing after
    // our first read of it but before our post-lock read.
    const staleTask = db.tasks.find((t) => t.id === 'task-a')!;
    const staleRead = { ...staleTask, column: { boardId: 'board-1' } };
    mockedTaskFindUnique.mockImplementationOnce(async () => ({
      ...staleRead,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    }));
    mockedTaskFindMany.mockImplementationOnce(async () =>
      ['task-b', 'task-c', 'task-d'].map((id) => db.tasks.find((t) => t.id === id)!),
    );
    // "Concurrent" state: task-a actually lives in col-doing at position 0 now.
    const taskA = db.tasks.find((t) => t.id === 'task-a')!;
    taskA.columnId = 'col-doing';
    taskA.position = 0;
    // The competing move renumbered both columns to stay contiguous:
    // col-doing x->1, y->2; col-todo b->0, c->1, d->2.
    db.tasks.find((t) => t.id === 'task-x')!.position = 1;
    db.tasks.find((t) => t.id === 'task-y')!.position = 2;
    db.tasks.find((t) => t.id === 'task-b')!.position = 0;
    db.tasks.find((t) => t.id === 'task-c')!.position = 1;
    db.tasks.find((t) => t.id === 'task-d')!.position = 2;

    // Move task-a (really in col-doing) to position 2 there.
    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ id: 'task-a', position: 2, columnId: 'col-doing' });
    expect(columnTasks('col-doing').map((t) => t.id)).toEqual(['task-x', 'task-y', 'task-a']);
    expectAllColumnsContiguous();
  });

  it('returns 409 when the task keeps relocating across retries', async () => {
    setupBoard();
    const staleTask = db.tasks.find((t) => t.id === 'task-a')!;
    mockedTaskFindUnique.mockImplementation(async () => ({
      ...staleTask,
      column: { boardId: 'board-1' },
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    }));
    mockedTaskFindMany.mockImplementation(async () => db.tasks.filter((t) => t.id !== 'task-a'));

    const res = await moveTaskRequest('task-a', OWNER, { targetColumnId: 'col-doing', targetPosition: 0 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(mockedTaskUpdate).not.toHaveBeenCalled();
  });
});
