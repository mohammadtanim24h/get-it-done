// Board authorization shared types.

/**
 * What the authenticated user is allowed to do with a board.
 * Resolved server-side from the database only — never from client input.
 */
export type BoardAccess = {
  boardId: string;
  /** True if the user owns the board. Owners have full control. */
  isOwner: boolean;
  /** True if the user has an active BoardMember row for this board. */
  isMember: boolean;
};

/**
 * Permission levels board routes can require.
 * - read:           owner or member (GET board, columns, tasks)
 * - content:        owner or member (create/update/delete columns and tasks, move tasks)
 * - modify:         owner only (update or delete the board itself)
 * - manageMembers:  owner only (add/remove members)
 */
export type BoardPermission = 'read' | 'content' | 'modify' | 'manageMembers';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by authorizeBoard middleware after a successful authorization.
       * Controllers can rely on it without re-querying the database.
       */
      boardAccess?: BoardAccess;
    }
  }
}
