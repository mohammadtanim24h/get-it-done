import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../utils/appError';
import type { BoardAccess, BoardPermission } from '../types/authorization';

/**
 * Central board authorization rules.
 *
 * Core rule: a user may access a board only if they are the board owner
 * or an active member of that board. All decisions are derived from the
 * database — never from client-provided values (body, query, params).
 *
 * Permission matrix:
 * | Action              | Owner | Member |
 * |---------------------|-------|--------|
 * | read board          | yes   | yes    |
 * | columns/tasks/moves | yes   | yes    |
 * | update board        | yes   | no     |
 * | delete board        | yes   | no     |
 * | manage members      | yes   | no     |
 */

/**
 * Resolve the user's relationship to a board in a single query.
 *
 * @returns the access context, or null when the board does not exist.
 *          (Access denial is expressed as isOwner=false, isMember=false —
 *          only a missing board returns null.)
 */
export async function getBoardAccess(userId: string, boardId: string): Promise<BoardAccess | null> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      ownerId: true,
      members: { where: { userId }, select: { id: true } },
    },
  });

  if (!board) return null;

  return {
    boardId: board.id,
    isOwner: board.ownerId === userId,
    isMember: board.members.length > 0,
  };
}

/** Does the user have any access to this board (owner or active member)? */
export const canAccessBoard = (access: BoardAccess): boolean => access.isOwner || access.isMember;

/** Can the user update or delete the board itself (title, deletion)? Owner only. */
export const canModifyBoard = (access: BoardAccess): boolean => access.isOwner;

/** Can the user add/remove board members? Owner only. */
export const canManageBoardMembers = (access: BoardAccess): boolean => access.isOwner;

/** Can the user create/update/delete columns and tasks, and move tasks? */
export const canModifyBoardContent = (access: BoardAccess): boolean => access.isOwner || access.isMember;

/** Check a named permission against an access context. */
export const hasBoardPermission = (access: BoardAccess, permission: BoardPermission): boolean => {
  switch (permission) {
    case 'read':
      return canAccessBoard(access);
    case 'content':
      return canModifyBoardContent(access);
    case 'modify':
      return canModifyBoard(access);
    case 'manageMembers':
      return canManageBoardMembers(access);
  }
};

/**
 * Load the access context or throw the appropriate error:
 * 404 for a non-existent board, 403 for no access. Used by the
 * authorizeBoard middleware and reusable from any controller/service.
 */
export async function requireBoardAccess(
  userId: string,
  boardId: string,
  permission: BoardPermission,
): Promise<BoardAccess> {
  const access = await getBoardAccess(userId, boardId);
  if (!access) {
    throw new NotFoundError('Board not found');
  }
  if (!hasBoardPermission(access, permission)) {
    throw new ForbiddenError();
  }
  return access;
}
