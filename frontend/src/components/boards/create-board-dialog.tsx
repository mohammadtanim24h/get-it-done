'use client';

import { useEffect, useRef, useState } from 'react';
import { FieldError, FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { validateBoardTitle } from '@/lib/validation';
import { ApiClientError } from '@/services/api-client';
import { boardsService } from '@/services/boards';
import type { BoardSummary } from '@/types/models';

export interface CreateBoardDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (board: BoardSummary) => void;
}

export function CreateBoardDialog({ open, onClose, onCreated }: CreateBoardDialogProps) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open so a reopened dialog never shows stale input or errors.
  useEffect(() => {
    if (open) {
      setTitle('');
      setSubmitting(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const board = await boardsService.createBoard({ title: title.trim() });
      onCreated(board);
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
    <Modal open={open} title="New board" onClose={guardedClose}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <div className="space-y-1">
          <label htmlFor="board-title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            ref={inputRef}
            id="board-title"
            type="text"
            autoComplete="off"
            className={authFieldClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'board-title-error' : undefined}
            data-autofocus
            disabled={submitting}
          />
          <FieldError id="board-title-error" messages={fieldErrors.title} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={guardedClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create board
          </Button>
        </div>
      </form>
    </Modal>
  );
}
