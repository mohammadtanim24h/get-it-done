// Column API shared types.

/** Column shape used in API responses. */
export type ColumnDto = {
  id: string;
  title: string;
  /** Zero-based position within the board. Contiguous: 0, 1, 2, ... */
  position: number;
  boardId: string;
  createdAt: Date;
  updatedAt: Date;
};
