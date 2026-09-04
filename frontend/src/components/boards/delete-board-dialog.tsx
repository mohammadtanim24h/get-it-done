'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiClientError } from '@/services/api-client';
import { boardsService } from '@/services/boards';
import type { BoardSummary } from '@/types/models';

export interface DeleteBoardDialogProps {
  open: boolean;
  board: BoardSummary | null;
  onClose: () => void;
  onDeleted: (boardId: string) => void;
}

export function DeleteBoardDialog({ open, board, onClose, onDeleted }: DeleteBoardDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!board) return;
    setSubmitting(true);
    setError(null);
    try {
      await boardsService.deleteBoard(board.id);
      onDeleted(board.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <ConfirmDialog
      open={open && board !== null}
      title="Delete board"
      message={
        <>
          Delete <span className="font-semibold text-slate-900">{board?.title}</span>? This
          permanently removes the board and all of its content. This action cannot be undone.
        </>
      }
      confirmLabel="Delete board"
      submitting={submitting}
      error={error}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
