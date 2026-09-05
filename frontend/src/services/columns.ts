import { apiClient } from './api-client';
import type { ApiEnvelope } from '@/types/api';
import type { BoardColumn } from '@/types/models';

/**
 * Column CRUD. Columns belong to a board; the backend assigns contiguous
 * 0-based positions and returns lists ordered by position (docs/API.md).
 */
export const columnsService = {
  async listColumns(boardId: string): Promise<BoardColumn[]> {
    const { data } = await apiClient.get<ApiEnvelope<{ columns: BoardColumn[] }>>(
      `/boards/${boardId}/columns`,
    );
    return data.columns;
  },

  async createColumn(boardId: string, input: { title: string }): Promise<BoardColumn> {
    const { data } = await apiClient.post<ApiEnvelope<{ column: BoardColumn }>>(
      `/boards/${boardId}/columns`,
      input,
    );
    return data.column;
  },

  async renameColumn(
    boardId: string,
    columnId: string,
    input: { title: string },
  ): Promise<BoardColumn> {
    const { data } = await apiClient.patch<ApiEnvelope<{ column: BoardColumn }>>(
      `/boards/${boardId}/columns/${columnId}`,
      input,
    );
    return data.column;
  },

  async deleteColumn(boardId: string, columnId: string): Promise<void> {
    await apiClient.delete(`/boards/${boardId}/columns/${columnId}`);
  },
};
