// Task API shared types.

/** Task shape used in API responses. */
export type TaskDto = {
  id: string;
  title: string;
  description: string;
  /** Zero-based position within the column. Contiguous: 0, 1, 2, ... */
  position: number;
  columnId: string;
  createdAt: Date;
  updatedAt: Date;
};
