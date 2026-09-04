// Board API shared types.

/** The authenticated user's relationship to a board. */
export type BoardRole = 'owner' | 'member';

/** Board shape used in create/list/update responses. */
export type BoardSummary = {
  id: string;
  title: string;
  ownerId: string;
  /** The requesting user's relationship to this board. */
  role: BoardRole;
  createdAt: Date;
  updatedAt: Date;
};

/** A user who has been added to a board. */
export type BoardMemberDto = {
  userId: string;
  name: string;
  email: string;
  addedAt: Date;
};

/** Board shape used in GET /api/boards/:boardId responses. */
export type BoardDetail = BoardSummary & {
  members: BoardMemberDto[];
};
