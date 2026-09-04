'use client';

import { useEffect, useRef, useState } from 'react';
import { FieldError, FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { validateBoardTitle } from '@/lib/validation';
import { ApiClientError } from '@/services/api-client';
import { boardsService } from '@/services/boards';
import type { BoardSummary } from '@/types/models';

export interface RenameBoardDialogProps {
  open: boolean;
  board: BoardSummary | null;
  onClose: () => void;
  onRenamed: (board: BoardSummary) => void;
}

export function RenameBoardDialog({ open, board, onClose, onRenamed }: RenameBoardDialogProps) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill on open and clear transient state.
  useEffect(() => {
    if (open) {
      setTitle(board?.title ?? '');
      setSubmitting(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, board]);

  const unchanged =
    board !== null && validateBoardTitle(title).length === 0 && title.trim() === board.title.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board) return;
    setError(null);

    const titleErrors = validateBoardTitle(title);
    if (titleErrors.length > 0) {
      setFieldErrors({ title: titleErrors });
      inputRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const updated = await boardsService.renameBoard(board.id, { title: title.trim() });
      onRenamed(updated);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  const guardedClose = () => {
    if (!submitting) onClose();
  };

  return (
    <Modal open={open} title="Rename board" onClose={guardedClose}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <div className="space-y-1">
          <label htmlFor="rename-board-title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            ref={inputRef}
            id="rename-board-title"
            type="text"
            autoComplete="off"
            className={authFieldClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'rename-board-title-error' : undefined}
            data-autofocus
            disabled={submitting}
          />
          <FieldError id="rename-board-title-error" messages={fieldErrors.title} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={guardedClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={unchanged}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
