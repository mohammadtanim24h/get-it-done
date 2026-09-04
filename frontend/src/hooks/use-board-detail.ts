'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '@/services/api-client';
import { boardsService } from '@/services/boards';
import type { BoardDetail, BoardMember } from '@/types/models';

export type BoardDetailStatus = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error';

export interface UseBoardDetailResult {
  board: BoardDetail | null;
  status: BoardDetailStatus;
  /** Populated only for status 'error' (network/unexpected failures). */
  loadError: string | null;
  adding: boolean;
  removingUserId: string | null;
  addMember: (email: string) => Promise<BoardMember>;
  removeMember: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Fetches a board (with members) and owns the member mutations. Pass `null`
 * while no board is selected — the hook idles and clears its state, so it can
 * stay mounted behind a share dialog opened from a list.
 */
export function useBoardDetail(boardId: string | null): UseBoardDetailResult {
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [status, setStatus] = useState<BoardDetailStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!boardId) return;
    setStatus('loading');
    setLoadError(null);
    try {
      setBoard(await boardsService.getBoard(boardId));
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setStatus('not-found');
          return;
        }
        if (err.status === 403) {
          setStatus('forbidden');
          return;
        }
        setLoadError(err.message);
      } else {
        setLoadError('Something went wrong. Please try again.');
      }
      setStatus('error');
    }
  }, [boardId]);

  useEffect(() => {
    if (!boardId) {
      setBoard(null);
      setStatus('loading');
      setLoadError(null);
      return;
    }
    void reload();
  }, [boardId, reload]);

  const addMember = useCallback(
    async (email: string) => {
      if (!boardId) throw new Error('No board selected.');
      setAdding(true);
      try {
        const member = await boardsService.addBoardMember(boardId, { email });
        setBoard((prev) =>
          prev ? { ...prev, members: [...prev.members, member] } : prev,
        );
        return member;
      } finally {
        setAdding(false);
      }
    },
    [boardId],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!boardId) throw new Error('No board selected.');
      setRemovingUserId(userId);
      try {
        await boardsService.removeBoardMember(boardId, userId);
        setBoard((prev) =>
          prev
            ? { ...prev, members: prev.members.filter((m) => m.userId !== userId) }
            : prev,
        );
      } finally {
        setRemovingUserId(null);
      }
    },
    [boardId],
  );

  return {
    board,
    status,
    loadError,
    adding,
    removingUserId,
    addMember,
    removeMember,
    reload,
  };
}
