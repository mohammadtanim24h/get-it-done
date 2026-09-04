import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    board: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { requireAuth } from '../src/middleware/auth';
import { authorizeBoard } from '../src/middleware/authorization';
import { errorHandler } from '../src/middleware/errorHandler';
import {
  getBoardAccess,
  canAccessBoard,
  canModifyBoard,
  canManageBoardMembers,
  canModifyBoardContent,
} from '../src/services/authorizationService';

const mockedFindUnique = vi.mocked(prisma.board.findUnique);

const TEST_JWT_SECRET = env.jwtSecret;
const COOKIE_NAME = env.jwtCookieName;

const OWNER_ID = 'user-owner';
const MEMBER_ID = 'user-member';
const OUTSIDER_ID = 'user-outsider';
const BOARD_ID = 'board-1';

/** Build a board row the way the service queries it: members filtered per user. */
const makeBoard = (ownerId: string, memberIds: string[], queriedUserId: string) => ({
  id: BOARD_ID,
  title: 'Project Board',
  ownerId,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  members: memberIds
    .filter((userId) => userId === queriedUserId)
    .map((userId) => ({ id: `membership-${userId}`, boardId: BOARD_ID, userId, createdAt: new Date() })),
});

/**
 * Mock prisma.board.findUnique to serve the given board, honoring the
 * per-user membership filter the service passes in its query (the filter
 * may arrive under `select` or `include` depending on the query shape).
 */
const mockBoard = (ownerId: string, memberIds: string[]) => {
  mockedFindUnique.mockImplementation(
    async (args: {
      where: { id: string };
      select?: { members?: { where: { userId: string } } };
      include?: { members?: { where: { userId: string } } };
    }) => {
      if (args.where.id !== BOARD_ID) return null;
      const queriedUserId = args.select?.members?.where.userId ?? args.include?.members?.where.userId ?? '';
      return makeBoard(ownerId, memberIds, queriedUserId) as never;
    },
  );
};

const signToken = (id: string, email: string): string =>
  jwt.sign({ email }, TEST_JWT_SECRET, { subject: id, expiresIn: '1h' });

const authCookie = (userId: string): string =>
  `${COOKIE_NAME}=${signToken(userId, `${userId}@example.com`)}`;

/**
 * Probe app that wires the authorization middleware exactly like real board
 * routes will be wired (requireAuth -> authorizeBoard -> controller). The
 * controller echoes the resolved access context so tests can assert what
 * downstream code would see.
 */
const createProbeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const echo: express.RequestHandler = (req, res) => {
    res.json({
      data: {
        boardAccess: req.boardAccess
          ? { isOwner: req.boardAccess.isOwner, isMember: req.boardAccess.isMember }
          : null,
      },
    });
  };

  const router = express.Router();
  router.get('/boards/:boardId', requireAuth, authorizeBoard('read'), echo);
  router.patch('/boards/:boardId', requireAuth, authorizeBoard('modify'), echo);
  router.delete('/boards/:boardId', requireAuth, authorizeBoard('modify'), echo);
  router.post('/boards/:boardId/members', requireAuth, authorizeBoard('manageMembers'), echo);
  router.post('/boards/:boardId/columns', requireAuth, authorizeBoard('content'), echo);
  app.use('/api', router);

  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  mockedFindUnique.mockReset();
});

describe('authorizationService.getBoardAccess', () => {
  it('identifies the board owner even without a membership row', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const access = await getBoardAccess(OWNER_ID, BOARD_ID);

    expect(access).not.toBeNull();
    expect(access!.isOwner).toBe(true);
    expect(access!.isMember).toBe(false);
    expect(canAccessBoard(access!)).toBe(true);
    expect(canModifyBoard(access!)).toBe(true);
    expect(canManageBoardMembers(access!)).toBe(true);
    expect(canModifyBoardContent(access!)).toBe(true);
  });

  it('identifies an active member with content-only permissions', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const access = await getBoardAccess(MEMBER_ID, BOARD_ID);

    expect(access).not.toBeNull();
    expect(access!.isOwner).toBe(false);
    expect(access!.isMember).toBe(true);
    expect(canAccessBoard(access!)).toBe(true);
    expect(canModifyBoard(access!)).toBe(false);
    expect(canManageBoardMembers(access!)).toBe(false);
    expect(canModifyBoardContent(access!)).toBe(true);
  });

  it('denies an unrelated user (no ownership, no membership)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const access = await getBoardAccess(OUTSIDER_ID, BOARD_ID);

    expect(access).not.toBeNull(); // board exists
    expect(access!.isOwner).toBe(false);
    expect(access!.isMember).toBe(false);
    expect(canAccessBoard(access!)).toBe(false);
    expect(canModifyBoard(access!)).toBe(false);
    expect(canManageBoardMembers(access!)).toBe(false);
    expect(canModifyBoardContent(access!)).toBe(false);
  });

  it('returns null for a non-existent board', async () => {
    mockedFindUnique.mockResolvedValue(null);

    const access = await getBoardAccess(OWNER_ID, 'does-not-exist');

    expect(access).toBeNull();
    // A non-existent board must never surface as an authorization decision.
    expect(mockedFindUnique).toHaveBeenCalledTimes(1);
    expect(mockedFindUnique.mock.calls[0]![0].where.id).toBe('does-not-exist');
  });
});

describe('authorizeBoard middleware', () => {
  it('allows the owner to read the board and attaches the access context', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp())
      .get(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(OWNER_ID));

    expect(res.status).toBe(200);
    expect(res.body.data.boardAccess).toEqual({ isOwner: true, isMember: false });
  });

  it('allows a member to read the board', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp())
      .get(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.data.boardAccess).toEqual({ isOwner: false, isMember: true });
  });

  it('allows a member to modify board content (columns/tasks)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp())
      .post(`/api/boards/${BOARD_ID}/columns`)
      .set('Cookie', authCookie(MEMBER_ID))
      .send({ title: 'Todo' });

    expect(res.status).toBe(200);
  });

  it('blocks a member from updating or deleting the board (403 FORBIDDEN)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const patch = await request(createProbeApp())
      .patch(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(MEMBER_ID))
      .send({ title: 'renamed' });
    const del = await request(createProbeApp())
      .delete(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(MEMBER_ID));

    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
    expect(patch.body.error.message).toBe(del.body.error.message); // consistent error
  });

  it('blocks a member from managing board membership (403 FORBIDDEN)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp())
      .post(`/api/boards/${BOARD_ID}/members`)
      .set('Cookie', authCookie(MEMBER_ID))
      .send({ email: 'someone@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows the owner to manage membership and update the board', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const members = await request(createProbeApp())
      .post(`/api/boards/${BOARD_ID}/members`)
      .set('Cookie', authCookie(OWNER_ID))
      .send({ email: 'someone@example.com' });
    const patch = await request(createProbeApp())
      .patch(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(OWNER_ID))
      .send({ title: 'renamed' });

    expect(members.status).toBe(200);
    expect(patch.status).toBe(200);
  });

  it('blocks an authenticated user from accessing a board they do not belong to (403, consistent error)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const read = await request(createProbeApp())
      .get(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(OUTSIDER_ID));
    const content = await request(createProbeApp())
      .post(`/api/boards/${BOARD_ID}/columns`)
      .set('Cookie', authCookie(OUTSIDER_ID))
      .send({ title: 'Todo' });

    expect(read.status).toBe(403);
    expect(content.status).toBe(403);
    expect(read.body.error.code).toBe('FORBIDDEN');
    expect(read.body.error.message).toBe(content.body.error.message);
  });

  it('does not trust client-provided ownership hints in the body (still 403)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp())
      .patch(`/api/boards/${BOARD_ID}`)
      .set('Cookie', authCookie(OUTSIDER_ID))
      .send({ ownerId: OUTSIDER_ID, owner: OUTSIDER_ID, title: 'hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 NOT_FOUND for a non-existent board without leaking details', async () => {
    mockedFindUnique.mockResolvedValue(null);

    const res = await request(createProbeApp())
      .get('/api/boards/nope')
      .set('Cookie', authCookie(OUTSIDER_ID));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 when not authenticated (auth runs before authorization)', async () => {
    mockBoard(OWNER_ID, [MEMBER_ID]);

    const res = await request(createProbeApp()).get(`/api/boards/${BOARD_ID}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mockedFindUnique).not.toHaveBeenCalled(); // no DB lookup for anonymous requests
  });

  it('rejects a request with no boardId route parameter (500-free, 404 NOT_FOUND)', async () => {
    const res = await request(createProbeApp())
      .get('/api/boards/')
      .set('Cookie', authCookie(OWNER_ID));

    expect(res.status).toBe(404); // express route not matched -> notFound-style
  });
});
