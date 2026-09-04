import { apiClient } from './api-client';
import type { ApiEnvelope } from '@/types/api';
import type { BoardDetail, BoardMember, BoardSummary } from '@/types/models';

/**
 * Board and board-member operations. Endpoints, envelopes, and permission
 * semantics are documented in docs/API.md; authorization is enforced by the
 * backend — the UI simply doesn't render owner-only affordances for shared
 * boards.
 */
export const boardsService = {
  async listBoards(): Promise<BoardSummary[]> {
    const { data } = await apiClient.get<ApiEnvelope<{ boards: BoardSummary[] }>>('/boards');
    return data.boards;
  },

  async createBoard(input: { title: string }): Promise<BoardSummary> {
    const { data } = await apiClient.post<ApiEnvelope<{ board: BoardSummary }>>('/boards', input);
    return data.board;
  },

  async getBoard(boardId: string): Promise<BoardDetail> {
    const { data } = await apiClient.get<ApiEnvelope<{ board: BoardDetail }>>(`/boards/${boardId}`);
    return data.board;
  },

  async renameBoard(boardId: string, input: { title: string }): Promise<BoardSummary> {
    const { data } = await apiClient.patch<ApiEnvelope<{ board: BoardSummary }>>(
      `/boards/${boardId}`,
      input,
    );
    return data.board;
  },

  async deleteBoard(boardId: string): Promise<void> {
    await apiClient.delete(`/boards/${boardId}`);
  },

  async addBoardMember(boardId: string, input: { email: string }): Promise<BoardMember> {
    const { data } = await apiClient.post<ApiEnvelope<{ member: BoardMember }>>(
      `/boards/${boardId}/members`,
      input,
    );
    return data.member;
  },

  async removeBoardMember(boardId: string, userId: string): Promise<void> {
    await apiClient.delete(`/boards/${boardId}/members/${userId}`);
  },
};
