import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-memory stand-in for Prisma models used by column endpoints. Deletes
// cascade the way the real schema does (column -> tasks).
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
    },
    board: {
      findUnique: vi.fn(),
    },
    boardMember: {
      findUnique: vi.fn(),
    },
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
const mockedColumnCreate = vi.mocked(prisma.column.create);
const mockedColumnFindMany = vi.mocked(prisma.column.findMany);
const mockedColumnFindUnique = vi.mocked(prisma.column.findUnique);
const mockedColumnUpdate = vi.mocked(prisma.column.update);
const mockedColumnUpdateMany = vi.mocked(prisma.column.updateMany);
const mockedColumnDelete = vi.mocked(prisma.column.delete);
const mockedColumnCount = vi.mocked(prisma.column.count);
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
  seq: 0,
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

beforeEach(() => {
  db.boards.length = 0;
  db.members.length = 0;
  db.columns.length = 0;
  db.tasks.length = 0;
  db.seq = 0;

  mockedBoardFindUnique.mockReset();
  mockedColumnCreate.mockReset();
  mockedColumnFindMany.mockReset();
  mockedColumnFindUnique.mockReset();
  mockedColumnUpdate.mockReset();
  mockedColumnUpdateMany.mockReset();
  mockedColumnDelete.mockReset();
  mockedColumnCount.mockReset();
  mockedTransaction.mockReset();

  // $transaction runs the callback against the same in-memory mock so the
  // interactive-transaction code path behaves like the real client.
  mockedTransaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));

  // Authorization query shape only (select with a per-user member filter).
  mockedBoardFindUnique.mockImplementation(
    async (args: { where: { id: string }; select?: { members?: { where: { userId: string } } } }) => {
      const board = db.boards.find((b) => b.id === args.where.id);
      if (!board) return null;
      if (args.select?.members) {
        const userId = args.select.members.where.userId;
        return {
          id: board.id,
          ownerId: board.ownerId,
          members: db.members.filter((m) => m.boardId === board.id && m.userId === userId),
        };
      }
      return board;
    },
  );

  mockedColumnCount.mockImplementation(async ({ where }: { where: { boardId: string } }) =>
    db.columns.filter((c) => c.boardId === where.boardId).length,
  );

  mockedColumnCreate.mockImplementation(
    async ({ data }: { data: { title: string; position: number; boardId: string } }) => {
      const column: TestColumn = {
        id: `column-${++db.seq}`,
        title: data.title,
        position: data.position,
        boardId: data.boardId,
      };
      db.columns.push(column);
      return { ...column, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
    },
  );

  mockedColumnFindMany.mockImplementation(
    async (args: { where: { boardId: string }; orderBy?: { position: 'asc' | 'desc' } }) => {
      const columns = db.columns.filter((c) => c.boardId === args.where.boardId);
      const order = args.orderBy?.position ?? 'asc';
      return [...columns]
        .sort((a, b) => (order === 'desc' ? b.position - a.position : a.position - b.position))
        .map((c) => ({ ...c, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') }));
    },
  );

  mockedColumnFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const column = db.columns.find((c) => c.id === where.id);
    if (!column) return null;
    return { ...column, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
  });

  mockedColumnUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { title?: string } }) => {
    const column = db.columns.find((c) => c.id === where.id);
    if (!column) throw Object.assign(new Error('not found'), { code: 'P2025' });
    if (data.title !== undefined) column.title = data.title;
    return { ...column, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-04-01T00:00:00.000Z') };
  });

  mockedColumnUpdateMany.mockImplementation(
    async (args: {
      where: { boardId: string; position: { gt: number } };
      data: { position: { decrement: number } };
    }) => {
      const matching = db.columns.filter(
        (c) => c.boardId === args.where.boardId && c.position > args.where.position.gt,
      );
      for (const column of matching) column.position -= args.data.position.decrement;
      return { count: matching.length };
    },
  );

  mockedColumnDelete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const column = db.columns.find((c) => c.id === where.id);
    if (!column) throw Object.assign(new Error('not found'), { code: 'P2025' });
    db.columns = db.columns.filter((c) => c.id !== column.id);
    // onDelete: Cascade — tasks of the deleted column go too.
    db.tasks = db.tasks.filter((t) => t.columnId !== column.id);
    return { ...column, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
  });
});

describe('POST /api/boards/:boardId/columns', () => {
  it('appends the first column at position 0 and returns 201', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'In Progress' });

    expect(res.status).toBe(201);
    expect(res.body.data.column).toMatchObject({
      title: 'In Progress',
      position: 0,
      boardId: 'board-1',
    });
    expect(res.body.data.column.id).toEqual(expect.any(String));
    // Position is computed from the board's current column count.
    expect(mockedColumnCount).toHaveBeenCalledWith({ where: { boardId: 'board-1' } });
  });

  it('appends subsequent columns at the end (positions 0, 1, 2)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);
    addColumn('board-1', 'col-b', 'Doing', 1);

    const res = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Done' });

    expect(res.status).toBe(201);
    expect(res.body.data.column).toMatchObject({ title: 'Done', position: 2, boardId: 'board-1' });
  });

  it('runs creation in a transaction (count + create are atomic)', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    await request(createApp()).post('/api/boards/board-1/columns').set('Cookie', authCookie(OWNER)).send({ title: 'Todo' });

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it('lets a board member create columns', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Todo' });

    expect(res.status).toBe(201);
  });

  it('blocks a non-member (403) without touching column data', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(OUTSIDER))
      .send({ title: 'Todo' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedColumnCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent board', async () => {
    const res = await request(createApp())
      .post('/api/boards/nope/columns')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Todo' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a missing or empty title', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const missing = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(OWNER))
      .send({});
    const empty = await request(createApp())
      .post('/api/boards/board-1/columns')
      .set('Cookie', authCookie(OWNER))
      .send({ title: '   ' });

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(empty.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).post('/api/boards/board-1/columns').send({ title: 'Todo' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/boards/:boardId/columns', () => {
  it('lists the board columns ordered by position', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-b', 'Doing', 1);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp()).get('/api/boards/board-1/columns').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(200);
    expect(res.body.data.columns.map((c: { id: string }) => c.id)).toEqual(['col-a', 'col-b']);
    expect(res.body.data.columns[0]).toMatchObject({ title: 'Todo', position: 0, boardId: 'board-1' });
  });

  it('lets a member list columns', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp()).get('/api/boards/board-1/columns').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.data.columns).toHaveLength(1);
  });

  it('blocks a non-member (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp()).get('/api/boards/board-1/columns').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a non-existent board', async () => {
    const res = await request(createApp()).get('/api/boards/nope/columns').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/boards/:boardId/columns/:columnId', () => {
  it('renames a column without changing its position', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);
    addColumn('board-1', 'col-b', 'Doing', 1);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/col-a')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Backlog' });

    expect(res.status).toBe(200);
    expect(res.body.data.column).toMatchObject({ id: 'col-a', title: 'Backlog', position: 0, boardId: 'board-1' });
    expect(mockedColumnUpdate).toHaveBeenCalledWith({ where: { id: 'col-a' }, data: { title: 'Backlog' } });
  });

  it('returns 404 when the column belongs to a different board', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addBoard('board-2', 'Other', OUTSIDER.id);
    addColumn('board-2', 'col-x', 'Foreign', 0);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/col-x')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(mockedColumnUpdate).not.toHaveBeenCalled();
  });

  it('lets a member rename a column', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/col-a')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Backlog' });

    expect(res.status).toBe(200);
    expect(res.body.data.column.title).toBe('Backlog');
  });

  it('blocks a non-member (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/col-a')
      .set('Cookie', authCookie(OUTSIDER))
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(mockedColumnUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent column', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/nope')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Backlog' });

    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty title', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp())
      .patch('/api/boards/board-1/columns/col-a')
      .set('Cookie', authCookie(OWNER))
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/boards/:boardId/columns/:columnId', () => {
  it('deletes a middle column, cascades its tasks, and keeps positions contiguous', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);
    addColumn('board-1', 'col-b', 'Doing', 1);
    addColumn('board-1', 'col-c', 'Done', 2);
    addTask('col-b', 'task-1', 'Some task', 0);

    const res = await request(createApp()).delete('/api/boards/board-1/columns/col-b').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    // Task deletion cascades with the column (documented behavior).
    expect(db.tasks.filter((t) => t.columnId === 'col-b')).toHaveLength(0);
    // Remaining columns are renumbered to 0, 1 with no gap.
    const positions = db.columns
      .filter((c) => c.boardId === 'board-1')
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, position: c.position }));
    expect(positions).toEqual([
      { id: 'col-a', position: 0 },
      { id: 'col-c', position: 1 },
    ]);
    // Delete + gap closing happen atomically in a transaction.
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedColumnUpdateMany).toHaveBeenCalledWith({
      where: { boardId: 'board-1', position: { gt: 1 } },
      data: { position: { decrement: 1 } },
    });
  });

  it('deleting the last column leaves the remaining positions untouched', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);
    addColumn('board-1', 'col-b', 'Done', 1);

    const res = await request(createApp()).delete('/api/boards/board-1/columns/col-b').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    expect(db.columns.filter((c) => c.boardId === 'board-1')).toEqual([
      { id: 'col-a', title: 'Todo', position: 0, boardId: 'board-1' },
    ]);
    // Gap closing still runs, but matches nothing past the last position.
    expect(mockedColumnUpdateMany).toHaveBeenCalledWith({
      where: { boardId: 'board-1', position: { gt: 1 } },
      data: { position: { decrement: 1 } },
    });
    expect(db.columns.filter((c) => c.boardId === 'board-1').every((c) => c.position === 0)).toBe(true);
  });

  it('returns 404 when the column belongs to a different board', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addBoard('board-2', 'Other', OUTSIDER.id);
    addColumn('board-2', 'col-x', 'Foreign', 0);

    const res = await request(createApp()).delete('/api/boards/board-1/columns/col-x').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(mockedColumnDelete).not.toHaveBeenCalled();
    expect(db.columns).toHaveLength(1);
  });

  it('blocks a non-member (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-a', 'Todo', 0);

    const res = await request(createApp()).delete('/api/boards/board-1/columns/col-a').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(mockedColumnDelete).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent column', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp()).delete('/api/boards/board-1/columns/nope').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
