// Domain models mirroring backend API responses. All timestamps are ISO strings.

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export type BoardRole = 'owner' | 'member';

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  /** Requesting user's relationship to the board. */
  role: BoardRole;
  createdAt: string;
  updatedAt: string;
}

export interface BoardMember {
  userId: string;
  name: string;
  email: string;
  addedAt: string;
}

export interface BoardDetail extends BoardSummary {
  members: BoardMember[];
}

/** Named BoardColumn because `Column` clashes with the DOM type. */
export interface BoardColumn {
  id: string;
  title: string;
  position: number;
  boardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  position: number;
  columnId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnTaskOrder {
  id: string;
  position: number;
}

export interface ColumnOrder {
  id: string;
  tasks: ColumnTaskOrder[];
}

export interface TaskMoveResult {
  task: Task;
  sourceColumn: ColumnOrder;
  destinationColumn: ColumnOrder;
}
