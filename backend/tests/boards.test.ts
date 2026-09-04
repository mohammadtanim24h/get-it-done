import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// In-memory stand-in for Prisma models used by board endpoints. Deletes
// cascade the way the real schema does (board -> members/columns/tasks).
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    user: {
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
  },
}));

import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { createApp } from '../src/app';

const mockedUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockedBoardCreate = vi.mocked(prisma.board.create);
const mockedBoardFindMany = vi.mocked(prisma.board.findMany);
const mockedBoardFindUnique = vi.mocked(prisma.board.findUnique);
const mockedBoardUpdate = vi.mocked(prisma.board.update);
const mockedBoardDelete = vi.mocked(prisma.board.delete);
const mockedMemberFindUnique = vi.mocked(prisma.boardMember.findUnique);
const mockedMemberCreate = vi.mocked(prisma.boardMember.create);
const mockedMemberDelete = vi.mocked(prisma.boardMember.delete);

const TEST_JWT_SECRET = env.jwtSecret;
const COOKIE_NAME = env.jwtCookieName;

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

const db = {
  users: [] as TestUser[],
  boards: [] as TestBoard[],
  members: [] as TestMember[],
  seq: 0,
};

const addUser = (id: string, name: string, email: string): TestUser => {
  const user: TestUser = {
    id,
    name,
    email,
    passwordHash: 'x',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  db.users.push(user);
  return user;
};

const addBoard = (id: string, title: string, ownerId: string): TestBoard => {
  const board: TestBoard = {
    id,
    title,
    ownerId,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  };
  db.boards.push(board);
  return board;
};

const addMember = (boardId: string, userId: string): TestMember => {
  const existing = db.members.find((m) => m.boardId === boardId && m.userId === userId);
  if (existing) return existing;
  const member: TestMember = {
    id: `member-${++db.seq}`,
    boardId,
    userId,
    createdAt: new Date('2026-02-02T00:00:00.000Z'),
  };
  db.members.push(member);
  return member;
};

const OWNER = addUser('user-owner', 'Olivia Owner', 'owner@example.com');
const MEMBER = addUser('user-member', 'Mike Member', 'member@example.com');
const OUTSIDER = addUser('user-outsider', 'Oscar Outsider', 'outsider@example.com');
const OTHER_OWNER = addUser('user-other', 'Nora Neighbor', 'other@example.com');

const signToken = (user: TestUser): string =>
  jwt.sign({ email: user.email }, TEST_JWT_SECRET, { subject: user.id, expiresIn: '1h' });

const authCookie = (user: TestUser): string => `${COOKIE_NAME}=${signToken(user)}`;

beforeEach(() => {
  db.users.length = 0;
  db.boards.length = 0;
  db.members.length = 0;
  db.seq = 0;
  [OWNER, MEMBER, OUTSIDER, OTHER_OWNER].forEach((u) => db.users.push(u));

  vi.mocked(prisma.user.findUnique).mockReset();
  mockedBoardCreate.mockReset();
  mockedBoardFindMany.mockReset();
  mockedBoardFindUnique.mockReset();
  mockedBoardUpdate.mockReset();
  mockedBoardDelete.mockReset();
  mockedMemberFindUnique.mockReset();
  mockedMemberCreate.mockReset();
  mockedMemberDelete.mockReset();

  mockedUserFindUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email) return db.users.find((u) => u.email === where.email) ?? null;
    if (where.id) return db.users.find((u) => u.id === where.id) ?? null;
    return null;
  });

  mockedBoardCreate.mockImplementation(async ({ data }: { data: { title: string; ownerId: string } }) => {
    const board: TestBoard = {
      id: `board-${++db.seq}`,
      title: data.title,
      ownerId: data.ownerId,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    };
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

      // Detail query shape (include owner and members with their user).
      if (args.include?.members) {
        return {
          ...board,
          owner: db.users.find((u) => u.id === board.ownerId) ?? null,
          members: db.members
            .filter((m) => m.boardId === board.id)
            .map((m) => ({
              ...m,
              user: db.users.find((u) => u.id === m.userId) ?? null,
            })),
        };
      }

      return board;
    },
  );

  mockedBoardUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { title?: string } }) => {
    const board = db.boards.find((b) => b.id === where.id);
    if (!board) throw Object.assign(new Error('not found'), { code: 'P2025' });
    if (data.title !== undefined) board.title = data.title;
    board.updatedAt = new Date('2026-04-01T00:00:00.000Z');
    return board;
  });

  mockedBoardDelete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const board = db.boards.find((b) => b.id === where.id);
    if (!board) throw Object.assign(new Error('not found'), { code: 'P2025' });
    db.boards = db.boards.filter((b) => b.id !== where.id);
    // onDelete: Cascade — memberships (and columns/tasks in the real DB) go too.
    db.members = db.members.filter((m) => m.boardId !== where.id);
    return board;
  });

  mockedMemberFindUnique.mockImplementation(async ({ where }: { where: { boardId_userId: { boardId: string; userId: string } } }) => {
    const { boardId, userId } = where.boardId_userId;
    return db.members.find((m) => m.boardId === boardId && m.userId === userId) ?? null;
  });

  mockedMemberCreate.mockImplementation(async ({ data }: { data: { boardId: string; userId: string } }) => {
    const duplicate = db.members.find((m) => m.boardId === data.boardId && m.userId === data.userId);
    if (duplicate) throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    return addMember(data.boardId, data.userId);
  });

  mockedMemberDelete.mockImplementation(async ({ where }: { where: { boardId_userId: { boardId: string; userId: string } } }) => {
    const { boardId, userId } = where.boardId_userId;
    const member = db.members.find((m) => m.boardId === boardId && m.userId === userId);
    if (!member) throw Object.assign(new Error('not found'), { code: 'P2025' });
    db.members = db.members.filter((m) => m !== member);
    return member;
  });
});

describe('POST /api/boards', () => {
  it('creates a board owned by the authenticated user and returns 201', async () => {
    const res = await request(createApp())
      .post('/api/boards')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'Engineering Tasks' });

    expect(res.status).toBe(201);
    expect(res.body.data.board).toMatchObject({
      title: 'Engineering Tasks',
      ownerId: OWNER.id,
      role: 'owner',
    });
    expect(res.body.data.board.id).toEqual(expect.any(String));
    expect(mockedBoardCreate).toHaveBeenCalledTimes(1);
    expect(mockedBoardCreate.mock.calls[0]![0].data).toEqual({ title: 'Engineering Tasks', ownerId: OWNER.id });
  });

  it('returns 400 VALIDATION_ERROR for a missing or empty title', async () => {
    const missing = await request(createApp()).post('/api/boards').set('Cookie', authCookie(OWNER)).send({});
    const empty = await request(createApp()).post('/api/boards').set('Cookie', authCookie(OWNER)).send({ title: '   ' });

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.details.fields.title).toBeInstanceOf(Array);
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).post('/api/boards').send({ title: 'Nope' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/boards', () => {
  it('returns only boards the user owns or is a member of, with their role', async () => {
    addBoard('board-owned', 'My Board', MEMBER.id);
    addBoard('board-shared', 'Shared Board', OTHER_OWNER.id);
    addMember('board-shared', MEMBER.id);
    addBoard('board-invisible', 'Someone Elses Board', OTHER_OWNER.id);

    const res = await request(createApp()).get('/api/boards').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(200);
    const boards = res.body.data.boards as Array<{ id: string; role: string }>;
    expect(boards.map((b) => b.id).sort()).toEqual(['board-owned', 'board-shared']);
    expect(boards.find((b) => b.id === 'board-owned')!.role).toBe('owner');
    expect(boards.find((b) => b.id === 'board-shared')!.role).toBe('member');
    // Scoped to the authenticated user: the query must filter by owner or membership.
    expect(mockedBoardFindMany).toHaveBeenCalledTimes(1);
    expect(mockedBoardFindMany.mock.calls[0]![0].where).toEqual({
      OR: [{ ownerId: MEMBER.id }, { members: { some: { userId: MEMBER.id } } }],
    });
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).get('/api/boards');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/boards/:boardId', () => {
  it('lets the owner view the board with its members', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp()).get('/api/boards/board-1').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(200);
    expect(res.body.data.board).toMatchObject({
      id: 'board-1',
      title: 'Project',
      ownerId: OWNER.id,
      role: 'owner',
    });
    expect(res.body.data.board.members).toEqual([
      // The owner is listed first, synthesized from the board's owner relation.
      { userId: OWNER.id, name: OWNER.name, email: OWNER.email, addedAt: '2026-02-01T00:00:00.000Z' },
      { userId: MEMBER.id, name: MEMBER.name, email: MEMBER.email, addedAt: '2026-02-02T00:00:00.000Z' },
    ]);
  });

  it('lets a member view the board with role "member"', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp()).get('/api/boards/board-1').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.data.board.role).toBe('member');
  });

  it('blocks a non-member from viewing (403 FORBIDDEN)', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp()).get('/api/boards/board-1').set('Cookie', authCookie(OUTSIDER));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a non-existent board', async () => {
    const res = await request(createApp()).get('/api/boards/nope').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/boards/:boardId', () => {
  it('lets the owner rename the board', async () => {
    addBoard('board-1', 'Old Title', OWNER.id);

    const res = await request(createApp())
      .patch('/api/boards/board-1')
      .set('Cookie', authCookie(OWNER))
      .send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.board).toMatchObject({ id: 'board-1', title: 'New Title', ownerId: OWNER.id, role: 'owner' });
    expect(mockedBoardUpdate).toHaveBeenCalledWith({ where: { id: 'board-1' }, data: { title: 'New Title' } });
  });

  it('blocks a member from updating the board (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .patch('/api/boards/board-1')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedBoardUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty title', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .patch('/api/boards/board-1')
      .set('Cookie', authCookie(OWNER))
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/boards/:boardId', () => {
  it('lets the owner delete the board (204) and cascade its memberships', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp()).delete('/api/boards/board-1').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockedBoardDelete).toHaveBeenCalledWith({ where: { id: 'board-1' } });
    // Cascade cleanup: no membership rows survive the board.
    expect(db.members.filter((m) => m.boardId === 'board-1')).toHaveLength(0);
  });

  it('blocks a member from deleting the board (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp()).delete('/api/boards/board-1').set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(403);
    expect(mockedBoardDelete).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent board', async () => {
    const res = await request(createApp()).delete('/api/boards/nope').set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/boards/:boardId/members', () => {
  it('lets the owner add a registered user and returns the member', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: MEMBER.email });

    expect(res.status).toBe(201);
    expect(res.body.data.member).toEqual({
      userId: MEMBER.id,
      name: MEMBER.name,
      email: MEMBER.email,
      addedAt: expect.any(String),
    });
    expect(mockedMemberCreate).toHaveBeenCalledWith({ data: { boardId: 'board-1', userId: MEMBER.id } });
  });

  it('normalizes the email before lookup', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: ' Member@Example.COM ' });

    expect(res.status).toBe(201);
    expect(mockedUserFindUnique).toHaveBeenCalledWith({ where: { email: 'member@example.com' } });
  });

  it('returns 404 for an unregistered email', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(mockedMemberCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the user is already a member', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: MEMBER.email });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 409 when trying to add the board owner as a member', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: OWNER.email });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(mockedMemberCreate).not.toHaveBeenCalled();
  });

  it('blocks a member from managing members (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(MEMBER))
      .send({ email: OUTSIDER.email });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks an unrelated user from inspecting membership (403, no leak)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OUTSIDER))
      .send({ email: OUTSIDER.email });

    expect(res.status).toBe(403);
    // Never reached the user lookup: membership of others is not inspectable.
    expect(mockedUserFindUnique).not.toHaveBeenCalled();
    expect(mockedMemberCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid email', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .post('/api/boards/board-1/members')
      .set('Cookie', authCookie(OWNER))
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/boards/:boardId/members/:userId', () => {
  it('lets the owner remove a member (204); the member loses access', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);

    const res = await request(createApp())
      .delete(`/api/boards/board-1/members/${MEMBER.id}`)
      .set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(204);
    expect(mockedMemberDelete).toHaveBeenCalledWith({
      where: { boardId_userId: { boardId: 'board-1', userId: MEMBER.id } },
    });

    const after = await request(createApp()).get('/api/boards/board-1').set('Cookie', authCookie(MEMBER));
    expect(after.status).toBe(403);
  });

  it('refuses to remove the board owner (409)', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .delete(`/api/boards/board-1/members/${OWNER.id}`)
      .set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(mockedMemberDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the user is not a member of the board', async () => {
    addBoard('board-1', 'Project', OWNER.id);

    const res = await request(createApp())
      .delete(`/api/boards/board-1/members/${OUTSIDER.id}`)
      .set('Cookie', authCookie(OWNER));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('blocks a member from removing other members (403)', async () => {
    addBoard('board-1', 'Project', OWNER.id);
    addMember('board-1', MEMBER.id);
    addMember('board-1', OUTSIDER.id);

    const res = await request(createApp())
      .delete(`/api/boards/board-1/members/${OUTSIDER.id}`)
      .set('Cookie', authCookie(MEMBER));

    expect(res.status).toBe(403);
    expect(mockedMemberDelete).not.toHaveBeenCalled();
  });
});

describe('cross-board access', () => {
  it('blocks a member of one board from accessing another board they do not belong to', async () => {
    addBoard('board-a', 'Board A', OWNER.id);
    addBoard('board-b', 'Board B', OTHER_OWNER.id);
    addMember('board-a', MEMBER.id);

    const read = await request(createApp()).get('/api/boards/board-b').set('Cookie', authCookie(MEMBER));
    const patch = await request(createApp())
      .patch('/api/boards/board-b')
      .set('Cookie', authCookie(MEMBER))
      .send({ title: 'Hijacked' });
    const addMemberToB = await request(createApp())
      .post('/api/boards/board-b/members')
      .set('Cookie', authCookie(MEMBER))
      .send({ email: OUTSIDER.email });
    const removeMemberFromB = await request(createApp())
      .delete(`/api/boards/board-b/members/${OUTSIDER.id}`)
      .set('Cookie', authCookie(MEMBER));

    for (const res of [read, patch, addMemberToB, removeMemberFromB]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});
