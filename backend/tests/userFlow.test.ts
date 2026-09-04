import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';

// End-to-end user-journey test: it drives the REAL HTTP stack (routing,
// validation, auth cookie, authorization, error mapping) against an
// in-memory stand-in for Prisma that mimics the schema's behavior
// (unique constraints, cascades, ordered queries). Passwords are hashed
// and compared with real bcrypt and session cookies are captured from the
// Set-Cookie header exactly like a browser would.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    board: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    boardMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
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
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { createApp } from '../src/app';

const mockedUserCreate = vi.mocked(prisma.user.create);
const mockedUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockedBoardCreate = vi.mocked(prisma.board.create);
const mockedBoardFindMany = vi.mocked(prisma.board.findMany);
const mockedBoardFindUnique = vi.mocked(prisma.board.findUnique);
const mockedMemberFindUnique = vi.mocked(prisma.boardMember.findUnique);
const mockedMemberCreate = vi.mocked(prisma.boardMember.create);
const mockedMemberDelete = vi.mocked(prisma.boardMember.delete);
const mockedColumnCreate = vi.mocked(prisma.column.create);
const mockedColumnFindUnique = vi.mocked(prisma.column.findUnique);
const mockedColumnFindMany = vi.mocked(prisma.column.findMany);
const mockedColumnCount = vi.mocked(prisma.column.count);
const mockedTaskCreate = vi.mocked(prisma.task.create);
const mockedTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockedTaskFindUniqueOrThrow = vi.mocked(prisma.task.findUniqueOrThrow);
const mockedTaskFindMany = vi.mocked(prisma.task.findMany);
const mockedTaskUpdate = vi.mocked(prisma.task.update);
const mockedTaskUpdateMany = vi.mocked(prisma.task.updateMany);
const mockedTaskCount = vi.mocked(prisma.task.count);
const mockedQueryRaw = vi.mocked(prisma.$queryRaw);
const mockedTransaction = vi.mocked(prisma.$transaction);

const NOW = new Date('2026-03-01T00:00:00.000Z');

interface TestUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

interface TestBoard {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestMember {
  id: string;
  boardId: string;
  userId: string;
  createdAt: Date;
}

interface TestColumn {
  id: string;
  title: string;
  position: number;
  boardId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestTask {
  id: string;
  title: string;
  description: string;
  position: number;
  columnId: string;
  createdAt: Date;
  updatedAt: Date;
}

const db = {
  seq: 0,
  users: [] as TestUser[],
  boards: [] as TestBoard[],
  members: [] as TestMember[],
  columns: [] as TestColumn[],
  tasks: [] as TestTask[],
};

const nextId = (prefix: string): string => `${prefix}-${++db.seq}`;

beforeEach(() => {
  db.seq = 0;
  db.users.length = 0;
  db.boards.length = 0;
  db.members.length = 0;
  db.columns.length = 0;
  db.tasks.length = 0;

  [
    mockedUserCreate,
    mockedUserFindUnique,
    mockedBoardCreate,
    mockedBoardFindMany,
    mockedBoardFindUnique,
    mockedMemberFindUnique,
    mockedMemberCreate,
    mockedMemberDelete,
    mockedColumnCreate,
    mockedColumnFindUnique,
    mockedColumnFindMany,
    mockedColumnCount,
    mockedTaskCreate,
    mockedTaskFindUnique,
    mockedTaskFindUniqueOrThrow,
    mockedTaskFindMany,
    mockedTaskUpdate,
    mockedTaskUpdateMany,
    mockedTaskCount,
    mockedQueryRaw,
    mockedTransaction,
  ].forEach((mock) => mock.mockReset());

  // Interactive transactions run against the same in-memory state.
  mockedTransaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  // The movement lock query always succeeds.
  mockedQueryRaw.mockResolvedValue([]);

  mockedUserCreate.mockImplementation(async ({ data }: { data: { name: string; email: string; passwordHash: string } }) => {
    if (db.users.some((u) => u.email === data.email)) {
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    }
    const user: TestUser = { id: nextId('user'), ...data, createdAt: NOW };
    db.users.push(user);
    return user;
  });

  mockedUserFindUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email) return db.users.find((u) => u.email === where.email) ?? null;
    if (where.id) return db.users.find((u) => u.id === where.id) ?? null;
    return null;
  });

  mockedBoardCreate.mockImplementation(async ({ data }: { data: { title: string; ownerId: string } }) => {
    const board: TestBoard = { id: nextId('board'), ...data, createdAt: NOW, updatedAt: NOW };
    db.boards.push(board);
    return board;
  });

  mockedBoardFindMany.mockImplementation(
    async (args: {
      where?: { OR?: Array<{ ownerId?: string; members?: { some: { userId: string } } }> };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      const conditions = args.where?.OR ?? [];
      const boards = db.boards.filter((board) =>
        conditions.some(
          (c) =>
            (c.ownerId !== undefined && c.ownerId === board.ownerId) ||
            (c.members !== undefined &&
              db.members.some((m) => m.boardId === board.id && m.userId === c.members!.some.userId)),
        ),
      );
      const order = args.orderBy?.createdAt ?? 'asc';
      return [...boards].sort((a, b) =>
        order === 'desc' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime(),
      );
    },
  );

  mockedBoardFindUnique.mockImplementation(
    async (args: {
      where: { id: string };
      select?: { members?: { where: { userId: string } } };
      include?: { members?: unknown };
    }) => {
      const board = db.boards.find((b) => b.id === args.where.id);
      if (!board) return null;
      // Authorization query shape (select with a per-user member filter).
      if (args.select?.members) {
        const userId = args.select.members.where.userId;
        return {
          id: board.id,
          ownerId: board.ownerId,
          members: db.members.filter((m) => m.boardId === board.id && m.userId === userId),
        };
      }
      // Board detail shape (include owner and members with their user).
      if (args.include?.members) {
        return {
          ...board,
          owner: db.users.find((u) => u.id === board.ownerId) ?? null,
          members: db.members
            .filter((m) => m.boardId === board.id)
            .map((m) => ({ ...m, user: db.users.find((u) => u.id === m.userId) ?? null })),
        };
      }
      return board;
    },
  );

  mockedMemberFindUnique.mockImplementation(
    async ({ where }: { where: { boardId_userId: { boardId: string; userId: string } } }) => {
      const { boardId, userId } = where.boardId_userId;
      return db.members.find((m) => m.boardId === boardId && m.userId === userId) ?? null;
    },
  );

  mockedMemberCreate.mockImplementation(async ({ data }: { data: { boardId: string; userId: string } }) => {
    if (db.members.some((m) => m.boardId === data.boardId && m.userId === data.userId)) {
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    }
    const member: TestMember = { id: nextId('member'), ...data, createdAt: NOW };
    db.members.push(member);
    return member;
  });

  mockedMemberDelete.mockImplementation(
    async ({ where }: { where: { boardId_userId: { boardId: string; userId: string } } }) => {
      const { boardId, userId } = where.boardId_userId;
      const member = db.members.find((m) => m.boardId === boardId && m.userId === userId);
      if (!member) throw Object.assign(new Error('not found'), { code: 'P2025' });
      db.members = db.members.filter((m) => m !== member);
      return member;
    },
  );

  mockedColumnCount.mockImplementation(async ({ where }: { where: { boardId: string } }) =>
    db.columns.filter((c) => c.boardId === where.boardId).length,
  );

  mockedColumnCreate.mockImplementation(
    async ({ data }: { data: { title: string; position: number; boardId: string } }) => {
      const column: TestColumn = { id: nextId('col'), ...data, createdAt: NOW, updatedAt: NOW };
      db.columns.push(column);
      return column;
    },
  );

  mockedColumnFindMany.mockImplementation(
    async (args: { where: { boardId: string }; orderBy?: { position: 'asc' | 'desc' } }) => {
      const columns = db.columns.filter((c) => c.boardId === args.where.boardId);
      const order = args.orderBy?.position ?? 'asc';
      return [...columns].sort((a, b) => (order === 'desc' ? b.position - a.position : a.position - b.position));
    },
  );

  mockedColumnFindUnique.mockImplementation(
    async (args: { where: { id: string }; select?: { boardId?: boolean } }) => {
      const column = db.columns.find((c) => c.id === args.where.id);
      if (!column) return null;
      if (args.select?.boardId !== undefined) return { boardId: column.boardId };
      return column;
    },
  );

  mockedTaskCount.mockImplementation(async ({ where }: { where: { columnId: string } }) =>
    db.tasks.filter((t) => t.columnId === where.columnId).length,
  );

  mockedTaskCreate.mockImplementation(
    async ({ data }: { data: { title: string; description: string; position: number; columnId: string } }) => {
      const task: TestTask = { id: nextId('task'), ...data, createdAt: NOW, updatedAt: NOW };
      db.tasks.push(task);
      return task;
    },
  );

  mockedTaskFindUnique.mockImplementation(
    async (args: {
      where: { id: string };
      select?: { column?: unknown };
      include?: { column?: unknown };
    }) => {
      const task = db.tasks.find((t) => t.id === args.where.id);
      if (!task) return null;
      if (args.select?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { column: { boardId: column?.boardId ?? '' } };
      }
      if (args.include?.column) {
        const column = db.columns.find((c) => c.id === task.columnId);
        return { ...task, column: column ? { ...column } : null };
      }
      return { ...task };
    },
  );

  mockedTaskFindUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const task = db.tasks.find((t) => t.id === where.id);
    if (!task) throw Object.assign(new Error('not found'), { code: 'P2025' });
    return { ...task };
  });

  mockedTaskFindMany.mockImplementation(
    async (args: { where: { columnId: string }; orderBy?: { position: 'asc' | 'desc' } }) => {
      const tasks = db.tasks.filter((t) => t.columnId === args.where.columnId);
      const order = args.orderBy?.position ?? 'asc';
      return [...tasks]
        .sort((a, b) => (order === 'desc' ? b.position - a.position : a.position - b.position))
        .map((t) => ({ ...t }));
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
      return { ...task };
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

/** Extract the session cookie pair from a login response, like a browser. */
const cookieFrom = (res: Response): string => {
  const setCookie = res.headers['set-cookie']?.[0];
  if (!setCookie) throw new Error('login response did not set the auth cookie');
  return setCookie.split(';')[0]!;
};

const expectContiguous = (columnId: string): void => {
  const positions = db.tasks
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.position - b.position)
    .map((t) => t.position);
  expect(positions).toEqual(positions.map((_, i) => i));
};

describe('complete user journey', () => {
  it('walks the full board-sharing lifecycle end to end', async () => {
    const app = createApp();

    // 1. Register three users (owner, future member, outsider).
    const register = async (name: string, email: string) =>
      request(app)
        .post('/api/auth/register')
        .send({ name, email, password: 'password-123' });

    const ownerReg = await register('Olivia Owner', 'owner@example.com');
    expect(ownerReg.status).toBe(201);
    expect(ownerReg.body.data.user).toMatchObject({ name: 'Olivia Owner', email: 'owner@example.com' });
    expect(ownerReg.body.data.user).not.toHaveProperty('passwordHash');

    const memberReg = await register('Mike Member', 'member@example.com');
    expect(memberReg.status).toBe(201);
    const outsiderReg = await register('Oscar Outsider', 'outsider@example.com');
    expect(outsiderReg.status).toBe(201);

    // Duplicate registration is a 409, not a 500.
    const dupReg = await register('Olivia Again', 'owner@example.com');
    expect(dupReg.status).toBe(409);
    expect(dupReg.body.error.code).toBe('CONFLICT');

    // 2. Login: each user receives an httpOnly session cookie.
    const login = async (email: string) =>
      request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password-123' });

    const ownerLogin = await login('owner@example.com');
    expect(ownerLogin.status).toBe(200);
    expect(ownerLogin.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    const ownerCookie = cookieFrom(ownerLogin);

    const memberLogin = await login('member@example.com');
    expect(memberLogin.status).toBe(200);
    const memberCookie = cookieFrom(memberLogin);

    const outsiderLogin = await login('outsider@example.com');
    expect(outsiderLogin.status).toBe(200);
    const outsiderCookie = cookieFrom(outsiderLogin);

    // Wrong password gets the same generic 401 as an unknown email.
    const badLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'wrong-password' });
    expect(badLogin.status).toBe(401);

    // 3. Owner creates a board.
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Cookie', ownerCookie)
      .send({ title: 'Project Phoenix' });
    expect(boardRes.status).toBe(201);
    expect(boardRes.body.data.board).toMatchObject({ title: 'Project Phoenix', role: 'owner' });
    const boardId = boardRes.body.data.board.id as string;

    // 4. Owner shares the board with the member (by email).
    const shareRes = await request(app)
      .post(`/api/boards/${boardId}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: 'Member@Example.com ' }); // normalized on the way in
    expect(shareRes.status).toBe(201);
    expect(shareRes.body.data.member).toMatchObject({ email: 'member@example.com' });

    // Sharing again is a 409 (duplicate membership).
    const dupShare = await request(app)
      .post(`/api/boards/${boardId}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: 'member@example.com' });
    expect(dupShare.status).toBe(409);

    // 5. Member can now access the board.
    const memberBoardRes = await request(app).get(`/api/boards/${boardId}`).set('Cookie', memberCookie);
    expect(memberBoardRes.status).toBe(200);
    expect(memberBoardRes.body.data.board).toMatchObject({ role: 'member' });
    expect(memberBoardRes.body.data.board.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: 'member@example.com' })]),
    );

    // The board shows up in the member's board list too.
    const memberBoardsRes = await request(app).get('/api/boards').set('Cookie', memberCookie);
    expect(memberBoardsRes.status).toBe(200);
    expect(memberBoardsRes.body.data.boards).toEqual([expect.objectContaining({ id: boardId, role: 'member' })]);

    // Owner scaffolds two columns.
    const colTodoRes = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set('Cookie', ownerCookie)
      .send({ title: 'Todo' });
    expect(colTodoRes.status).toBe(201);
    const colTodoId = colTodoRes.body.data.column.id as string;

    const colDoingRes = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set('Cookie', ownerCookie)
      .send({ title: 'Doing' });
    expect(colDoingRes.status).toBe(201);
    const colDoingId = colDoingRes.body.data.column.id as string;

    // 6. Member creates tasks (members have content permission).
    const createTask = (cookie: string, columnId: string, title: string) =>
      request(app).post(`/api/columns/${columnId}/tasks`).set('Cookie', cookie).send({ title });

    for (const title of ['Write spec', 'Build API', 'Write tests']) {
      const res = await createTask(memberCookie, colTodoId, title);
      expect(res.status).toBe(201);
    }
    const doingTaskRes = await createTask(memberCookie, colDoingId, 'Ship it');
    expect(doingTaskRes.status).toBe(201);
    const doingTaskId = doingTaskRes.body.data.task.id as string;

    // Positions were assigned server-side, append-to-end.
    const todoTasksRes = await request(app).get(`/api/columns/${colTodoId}/tasks`).set('Cookie', memberCookie);
    expect(todoTasksRes.status).toBe(200);
    expect(todoTasksRes.body.data.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Write spec',
      'Build API',
      'Write tests',
    ]);
    expect(todoTasksRes.body.data.tasks.map((t: { position: number }) => t.position)).toEqual([0, 1, 2]);

    // 7. Member moves a task across columns.
    const specTaskId = todoTasksRes.body.data.tasks[0].id as string;
    const moveRes = await request(app)
      .patch(`/api/tasks/${specTaskId}/move`)
      .set('Cookie', memberCookie)
      .send({ targetColumnId: colDoingId, targetPosition: 0 });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.task).toMatchObject({ id: specTaskId, columnId: colDoingId, position: 0 });
    expect(moveRes.body.data.sourceColumn.tasks.map((t: { position: number }) => t.position)).toEqual([0, 1]);
    expect(moveRes.body.data.destinationColumn.tasks.map((t: { position: number }) => t.position)).toEqual([0, 1]);

    // 8. An unrelated user gets no access to anything on this board.
    const outsiderBoard = await request(app).get(`/api/boards/${boardId}`).set('Cookie', outsiderCookie);
    expect(outsiderBoard.status).toBe(403);
    const outsiderTasks = await request(app).get(`/api/columns/${colTodoId}/tasks`).set('Cookie', outsiderCookie);
    expect(outsiderTasks.status).toBe(403);
    const outsiderMove = await request(app)
      .patch(`/api/tasks/${specTaskId}/move`)
      .set('Cookie', outsiderCookie)
      .send({ targetColumnId: colTodoId, targetPosition: 0 });
    expect(outsiderMove.status).toBe(403);
    const outsiderShare = await request(app)
      .post(`/api/boards/${boardId}/members`)
      .set('Cookie', outsiderCookie)
      .send({ email: 'outsider@example.com' });
    expect(outsiderShare.status).toBe(403);

    // And without a session at all, everything is 401.
    const anonBoard = await request(app).get(`/api/boards/${boardId}`);
    expect(anonBoard.status).toBe(401);

    // 9. Owner removes the member.
    const memberUserId = memberBoardRes.body.data.board.members.find(
      (m: { email: string }) => m.email === 'member@example.com',
    ).userId as string;
    const removeRes = await request(app)
      .delete(`/api/boards/${boardId}/members/${memberUserId}`)
      .set('Cookie', ownerCookie);
    expect(removeRes.status).toBe(204);

    // 10. The removed member immediately loses access — including to
    // objects they created while they were a member.
    const removedBoard = await request(app).get(`/api/boards/${boardId}`).set('Cookie', memberCookie);
    expect(removedBoard.status).toBe(403);
    const removedTaskList = await request(app).get(`/api/columns/${colTodoId}/tasks`).set('Cookie', memberCookie);
    expect(removedTaskList.status).toBe(403);
    const removedTaskGet = await request(app).get(`/api/tasks/${specTaskId}`).set('Cookie', memberCookie);
    expect(removedTaskGet.status).toBe(403);
    const removedMove = await request(app)
      .patch(`/api/tasks/${doingTaskId}/move`)
      .set('Cookie', memberCookie)
      .send({ targetColumnId: colTodoId, targetPosition: 0 });
    expect(removedMove.status).toBe(403);
    const removedBoardsList = await request(app).get('/api/boards').set('Cookie', memberCookie);
    expect(removedBoardsList.status).toBe(200);
    expect(removedBoardsList.body.data.boards).toEqual([]);

    // 11. Column and task ordering is still valid everywhere.
    const finalColumnsRes = await request(app).get(`/api/boards/${boardId}/columns`).set('Cookie', ownerCookie);
    expect(finalColumnsRes.status).toBe(200);
    expect(finalColumnsRes.body.data.columns.map((c: { position: number }) => c.position)).toEqual([0, 1]);
    expectContiguous(colTodoId);
    expectContiguous(colDoingId);
    const finalTodo = await request(app).get(`/api/columns/${colTodoId}/tasks`).set('Cookie', ownerCookie);
    expect(finalTodo.body.data.tasks.map((t: { title: string }) => t.title)).toEqual(['Build API', 'Write tests']);
  });
});

describe('unexpected errors', () => {
  it('maps an unexpected service failure to a consistent 500 error body', async () => {
    mockedUserFindUnique.mockRejectedValue(new Error('connection reset by peer'));
    const app = createApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'password-123' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error).toHaveProperty('message');
  });
});
