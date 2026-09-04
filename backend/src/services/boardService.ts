import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../utils/appError';
import type { BoardDetail, BoardMemberDto, BoardSummary } from '../types/board';
import type { CreateBoardInput, UpdateBoardInput, AddBoardMemberInput } from '../validators/boardValidators';

/**
 * Board business logic. HTTP concerns live in the controller; authorization
 * is enforced before these functions run (requireAuth + authorizeBoard for
 * board-scoped routes). Ownership for creation is taken from the
 * authenticated user, never from the request body.
 *
 * Cleanup on delete relies on the Prisma schema's cascades: deleting a
 * board removes its memberships, columns, and tasks (no orphaned rows).
 */

const boardSelect = { id: true, title: true, ownerId: true, createdAt: true, updatedAt: true } as const;

type BoardRecord = { id: string; title: string; ownerId: string; createdAt: Date; updatedAt: Date };

const toSummary = (board: BoardRecord, userId: string): BoardSummary => ({
  id: board.id,
  title: board.title,
  ownerId: board.ownerId,
  role: board.ownerId === userId ? 'owner' : 'member',
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
});

/** Create a board; the authenticated user becomes its owner. */
export async function createBoard(userId: string, input: CreateBoardInput): Promise<BoardSummary> {
  const board = await prisma.board.create({
    data: { title: input.title, ownerId: userId },
    select: boardSelect,
  });
  return toSummary(board, userId);
}

/** List boards the user owns or is a member of, newest first. */
export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const boards = await prisma.board.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: boardSelect,
    orderBy: { createdAt: 'desc' },
  });
  return boards.map((board) => toSummary(board, userId));
}

/** Fetch a single board with its members. Authorization happens upstream. */
export async function getBoard(boardId: string, userId: string): Promise<BoardDetail> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!board) throw new NotFoundError('Board not found');

  // The owner has no membership row (access comes from ownership), but the
  // members list is the board's roster — include the owner as its first entry
  // so every reader can see who owns the board. Removal of that entry stays
  // blocked by removeBoardMember's owner guard.
  const members: BoardMemberDto[] = [
    {
      userId: board.owner.id,
      name: board.owner.name,
      email: board.owner.email,
      addedAt: board.createdAt,
    },
    ...board.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      addedAt: member.createdAt,
    })),
  ];

  return { ...toSummary(board, userId), members };
}

/** Update an owned board (owner-only route). */
export async function updateBoard(boardId: string, userId: string, input: UpdateBoardInput): Promise<BoardSummary> {
  const board = await prisma.board.update({
    where: { id: boardId },
    data: { title: input.title },
  });
  return toSummary(board, userId);
}

/**
 * Delete an owned board (owner-only route). Memberships, columns, and tasks
 * are removed by the database's onDelete: Cascade rules.
 */
export async function deleteBoard(boardId: string): Promise<void> {
  await prisma.board.delete({ where: { id: boardId } });
}

/** Add a registered user to a board (owner-only route). */
export async function addBoardMember(boardId: string, input: AddBoardMemberInput): Promise<BoardMemberDto> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { ownerId: true } });
  if (!board) throw new NotFoundError('Board not found');

  // Only registered users can be added — membership is by account, not invite.
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new NotFoundError('No user registered with that email');

  // The owner already has full access by design; never store a membership row.
  if (user.id === board.ownerId) {
    throw new ConflictError('The board owner already has access to this board');
  }

  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: user.id } },
  });
  if (existing) throw new ConflictError('User is already a member of this board');

  const member = await prisma.boardMember.create({ data: { boardId, userId: user.id } });
  return { userId: user.id, name: user.name, email: user.email, addedAt: member.createdAt };
}

/** Remove a member from a board (owner-only route). */
export async function removeBoardMember(boardId: string, userId: string): Promise<void> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { ownerId: true } });
  if (!board) throw new NotFoundError('Board not found');

  // The owner's access comes from ownership, not a membership row that
  // could be deleted — guard so they cannot be removed "as a member".
  if (userId === board.ownerId) {
    throw new ConflictError('The board owner cannot be removed from the board');
  }

  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });
  if (!member) throw new NotFoundError('Member not found');

  await prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
}
