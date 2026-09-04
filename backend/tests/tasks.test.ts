import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-memory stand-in for Prisma models used by task endpoints. Tasks and
// columns cascade the way the real schema does.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
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
const mockedColumnFindUnique = vi.mocked(prisma.column.findUnique);
const mockedTaskCreate = vi.mocked(prisma.task.create);
const mockedTaskFindMany = vi.mocked(prisma.task.findMany);
const mockedTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockedTaskUpdate = vi.mocked(prisma.task.update);
const mockedTaskUpdateMany = vi.mocked(prisma.task.updateMany);
const mockedTaskDelete = vi.mocked(prisma.task.delete);
const mockedTaskCount = vi.mocked(prisma.task.count);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedQueryRaw = vi.mocked(prisma.$queryRaw);

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

const addTask = (columnId: string, id: string, title: string, position: number, description = ''): TestTask => {
  const task: TestTask = { id, title, description, position, columnId };
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
  mockedColumnFindUnique.mockReset();
  mockedTaskCreate.mockReset();
  mockedTaskFindMany.mockReset();
  mockedTaskFindUnique.mockReset();
  mockedTaskUpdate.mockReset();
  mockedTaskUpdateMany.mockReset();
  mockedTaskDelete.mockReset();
  mockedTaskCount.mockReset();
  mockedTransaction.mockReset();
  mockedQueryRaw.mockReset();

  // Row locks (FOR UPDATE) always succeed against the in-memory DB.
  mockedQueryRaw.mockResolvedValue([]);

  // $transaction runs the callback against the same in-memory mock so the
  // interactive-transaction code path behaves like the real client.
  mockedTransaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));

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

  mockedColumnFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const column = db.columns.find((c) => c.id === args.where.id);
    if (!column) return null;
    // Shape used by the authorization resolver: column -> boardId.
    if ('boardId' in (args.select ?? {})) {
      return { boardId: column.boardId };
    }
    return column;
  });

  mockedTaskCount.mockImplementation(async ({ where }: { where: { columnId: string } }) =>
    db.tasks.filter((t) => t.columnId === where.columnId).length,
  );

  mockedTaskCreate.mockImplementation(
    async ({ data }: { data: { title: string; description: string; position: number; columnId: string } }) => {
      const task: TestTask = {
        id: `task-${++db.seq}`,
        title: data.title,
        description: data.description,
        position: data.position,
        columnId: data.columnId,
      };
      db.tasks.push(task);
      return { ...task, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
    },
  );

  mockedTaskFindMany.mockImplementation(
    async (args: { where: { columnId: string }; orderBy?: { position: 'asc' | 'desc' } }) => {
      const tasks = db.tasks.filter((t) => t.columnId === args.where.columnId);
      const order = args.orderBy?.position ?? 'asc';
      return [...tasks]
        .sort((a, b) => (order === 'desc' ? b.position - a.position : a.position - b.position))
        .map((t) => ({ ...t, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') }));
    },
  );

  mockedTaskFindUnique.mockImplementation(
    async (args: {
      where: { id: string };
      select?: { column?: { select?: { boardId?: boolean } } };
      include?: { column?: unknown };
    }) => {
      const task = db.tasks.find((t) => t.id === args.where.id);
      if (!task) return null;
      const stamp = { createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
      // Shape used by the authorization resolver: task -> column.boardId.
      if (args.select?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { column: { boardId: column?.boardId ?? '' } };
      }
      // Shape used by update/delete services: full task with its column.
      if (args.include?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { ...task, ...stamp, column: column ? { ...column, ...stamp } : null };
      }
      return { ...task, ...stamp };
    },
  );

  mockedTaskUpdate.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: { title?: string; description?: string } }) => {
      const task = db.tasks.find((t) => t.id === where.id);
      if (!task) throw Object.assign(new Error('not found'), { code: 'P2025' });
      if (data.title !== undefined) task.title = data.title;
      if (data.description !== undefined) task.description = data.description;
      return { ...task, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-04-01T00:00:00.000Z') };
    },
  );

  mockedTaskUpdateMany.mockImplementation(
    async (args: {
      where: { columnId: string; position: { gt: number } };
      data: { position: { decrement: number } };
    }) => {
      const matching = db.tasks.filter(
        (t) => t.columnId === args.where.columnId && t.position > args.where.position.gt,
      );
      for (const task of matching) task.position -= args.data.position.decrement;
      return { count: matching.length };
    },
  );

  mockedTaskDelete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const task = db.tasks.find((t) => t.id === where.id);
    if (!task) throw Object.assign(new Error('not found'), { code: 'P2025' });
    db.tasks = db.tasks.filter((t) => t.id !== task.id);
    return { ...task, createdAt: new Date('2026-03-01T00:00:00.000Z'), updatedAt: new Date('2026-03-01T00:00:00.000Z') };
  });
});

describe('POST /api/columns/:columnId/tasks', () => {
  it('appends the first task at position 0 and returns 201', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Implement auth middleware', description: 'Add JWT middleware and tests' });

    expect(res.status).toBe(201);
    expect(res.body.data.task).toMatchObject({
      title: 'Implement auth middleware',
      description: 'Add JWT middleware and tests',
      position: 0,
      columnId: 'col-1',
    });
    expect(res.body.data.task.id).toEqual(expect.any(String));
  });

  it('appends subsequent tasks at the end (positions 0, 1, 2)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-a', 'First', 0);
    addTask('col-1', 'task-b', 'Second', 1);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Third' });

    expect(res.status).toBe(201);
    expect(res.body.data.task).toMatchObject({ title: 'Third', position: 2, columnId: 'col-1' });
  });

  it('ignores a client-supplied position; the backend assigns it', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-a', 'First', 0);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Second', description: '', position: 99 });

    expect(res.status).toBe(201);
    expect(res.body.data.task.position).toBe(1);
    expect(mockedTaskCreate.mock.calls[0]![0].data).toMatchObject({ position: 1 });
    expect(mockedTaskCreate.mock.calls[0]![0].data).not.toHaveProperty('position', 99);
  });

  it('locks the column row FOR UPDATE before counting, inside the transaction', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Racing task' });

    expect(res.status).toBe(201);
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    // Concurrent appends (and moves that renumber the column) serialize on
    // the same FOR UPDATE column lock taskMovementService takes; without it
    // two racing creates both compute the same append position and one
    // fails on the (columnId, position) unique constraint.
    expect(mockedQueryRaw).toHaveBeenCalledTimes(1);
    const sql = (mockedQueryRaw.mock.calls[0]![0] as readonly string[]).join('§');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"Column"');
    expect(mockedQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockedTaskCount.mock.invocationCallOrder[0]!,
    );
  });

  it('lets a board member create tasks', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Member task' });

    expect(res.status).toBe(201);
  });

  it('blocks a user without access to the parent board (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const res = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OUTSIDER))
      .send({ title: 'Sneaky task' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedTaskCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent column', async () => {
    const res = await request(createApp())
      .post('/api/columns/nope/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Task' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a missing or empty title', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const missing = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ description: 'no title' });
    const empty = await request(createApp())
      .post('/api/columns/col-1/tasks')
      .set('Cookie', authCookie(OWNER))
      .send({ title: '   ' });

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(empty.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).post('/api/columns/col-1/tasks').send({ title: 'Task' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/columns/:columnId/tasks', () => {
  it('lists the column tasks ordered by position', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-b', 'Second', 1);
    addTask('col-1', 'task-a', 'First', 0);

    const res = await request(createApp()).get('/api/columns/col-1/tasks').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.map((t: { id: string }) => t.id)).toEqual(['task-a', 'task-b']);
    expect(res.body.data.tasks[0]).toMatchObject({ title: 'First', position: 0, columnId: 'col-1' });
  });

  it('lets a member list tasks', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-a', 'First', 0);

    const res = await request(createApp()).get('/api/columns/col-1/tasks').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
  });

  it('blocks a non-member (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);

    const res = await request(createApp()).get('/api/columns/col-1/tasks').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a non-existent column', async () => {
    const res = await request(createApp()).get('/api/columns/nope/tasks').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/tasks/:taskId', () => {
  it('returns a task for the board owner', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Implement auth middleware', 0, 'Add JWT middleware and tests');

    const res = await request(createApp()).get('/api/tasks/task-1').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({
      id: 'task-1',
      title: 'Implement auth middleware',
      description: 'Add JWT middleware and tests',
      position: 0,
      columnId: 'col-1',
    });
  });

  it('lets a board member fetch a task', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp()).get('/api/tasks/task-1').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.data.task.id).toBe('task-1');
  });

  it('blocks access through the parent board (403 for a non-member)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp()).get('/api/tasks/task-1').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a non-existent task', async () => {
    const res = await request(createApp()).get('/api/tasks/nope').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/tasks/:taskId', () => {
  it('updates title and description without altering position', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Old title', 0);
    addTask('col-1', 'task-2', 'Second', 1);

    const res = await request(createApp())
      .patch('/api/tasks/task-1')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'New title', description: 'New description' });

    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({
      id: 'task-1',
      title: 'New title',
      description: 'New description',
      position: 0,
      columnId: 'col-1',
    });
    expect(mockedTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { title: 'New title', description: 'New description' },
    });
    expect(mockedTaskUpdateMany).not.toHaveBeenCalled();
  });

  it('lets a board member update a task', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp())
      .patch('/api/tasks/task-1')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Member edit' });

    expect(res.status).toBe(200);
    expect(res.body.data.task.title).toBe('Member edit');
  });

  it('blocks a non-member of the parent board (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp())
      .patch('/api/tasks/task-1')
      .set('Cookie', authCookie(OUTSIDER))
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(mockedTaskUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent task', async () => {
    const res = await request(createApp())
      .patch('/api/tasks/nope')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'New title' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an empty title', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp())
      .patch('/api/tasks/task-1')
      .set('Cookie', authCookie(OWNER))
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/tasks/:taskId', () => {
  it('deletes a middle task and closes the ordering gap', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-a', 'First', 0);
    addTask('col-1', 'task-b', 'Second', 1);
    addTask('col-1', 'task-c', 'Third', 2);

    const res = await request(createApp()).delete('/api/tasks/task-b').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    // Delete + gap closing are atomic in a transaction.
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTaskDelete).toHaveBeenCalledWith({ where: { id: 'task-b' } });
    expect(mockedTaskUpdateMany).toHaveBeenCalledWith({
      where: { columnId: 'col-1', position: { gt: 1 } },
      data: { position: { decrement: 1 } },
    });
    const positions = db.tasks
      .filter((t) => t.columnId === 'col-1')
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ id: t.id, position: t.position }));
    expect(positions).toEqual([
      { id: 'task-a', position: 0 },
      { id: 'task-c', position: 1 },
    ]);
  });

  it('deleting a task in one column does not renumber another column', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addColumn('board-1', 'col-2', 'Doing', 1);
    addTask('col-1', 'task-a', 'First', 0);
    addTask('col-2', 'task-b', 'Other column task', 0);

    const res = await request(createApp()).delete('/api/tasks/task-a').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    expect(mockedTaskUpdateMany).toHaveBeenCalledWith({
      where: { columnId: 'col-1', position: { gt: 0 } },
      data: { position: { decrement: 1 } },
    });
    expect(db.tasks.find((t) => t.id === 'task-b')!.position).toBe(0);
  });

  it('blocks a non-member of the parent board (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addColumn('board-1', 'col-1', 'Todo', 0);
    addTask('col-1', 'task-1', 'Some task', 0);

    const res = await request(createApp()).delete('/api/tasks/task-1').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(mockedTaskDelete).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent task', async () => {
    const res = await request(createApp()).delete('/api/tasks/nope').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('cross-board access via task ids', () => {
  it('blocks a member of one board from touching another board task through its id', async () => {
    addBoard('board-a', 'Board A', OWNER.id);
    addBoard('board-b', 'Board B', OUTSIDER.id);
    addMember('board-a', MEMBER.id);
    addColumn('board-b', 'col-b', 'Foreign column', 0);
    addTask('col-b', 'task-foreign', 'Foreign task', 0);

    const read = await request(createApp()).get('/api/tasks/task-foreign').set('Cookie', authCookie(MEMBER));
    const patch = await request(createApp())
      .patch('/api/tasks/task-foreign')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Hijacked' });
    const remove = await request(createApp()).delete('/api/tasks/task-foreign').set('Cookie', authCookie(MEMBER));

    for (const res of [read, patch, remove]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(db.tasks).toHaveLength(1);
  });

  it('blocks a non-member from creating tasks in another board column', async () => {
    addBoard('board-a', 'Board A', OWNER.id);
    addMember('board-a', MEMBER.id);
    addBoard('board-b', 'Board B', OUTSIDER.id);
    addColumn('board-b', 'col-b', 'Foreign column', 0);

    const create = await request(createApp())
      .post('/api/columns/col-b/tasks')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Injected task' });
    const list = await request(createApp()).get('/api/columns/col-b/tasks').set('Cookie', authCookie(MEMBER));

    expect(create.status).toBe(403);
    expect(list.status).toBe(403);
    expect(db.tasks).toHaveLength(0);
  });
});
