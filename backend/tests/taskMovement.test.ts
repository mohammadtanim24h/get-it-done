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
});
