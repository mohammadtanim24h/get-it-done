'use client';

import { useEffect, useRef, useState } from 'react';
import { FieldError, FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { UseBoardDetailResult } from '@/hooks/use-board-detail';
import { ApiClientError } from '@/services/api-client';
import { validateShareForm } from '@/lib/validation';
import { MembersPanel } from './members-panel';

export interface ShareBoardDialogProps {
  open: boolean;
  boardApi: UseBoardDetailResult;
  onClose: () => void;
}

export function ShareBoardDialog({ open, boardApi, onClose }: ShareBoardDialogProps) {
  const { board, adding, removingUserId, addMember } = boardApi;
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEmail('');
      setFieldErrors({});
      setAddError(null);
    }
  }, [open]);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddError(null);

    const errors = validateShareForm({ email });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      inputRef.current?.focus();
      return;
    }

    setFieldErrors({});
    try {
      await addMember(email.trim());
      setEmail('');
    } catch (err) {
      // The backend resolves the email: 404 = no registered user, 409 =
      // already a member / owner. Its message is user-displayable.
      setAddError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  }

  const guardedClose = () => {
    if (!adding && !removingUserId) onClose();
  };

  return (
    <Modal
      open={open}
      title={board ? `Share ${board.title}` : 'Share board'}
      onClose={guardedClose}
    >
      <div className="space-y-4">
        <form className="space-y-1" onSubmit={handleAdd} noValidate>
          <label htmlFor="member-email" className="block text-sm font-medium text-slate-700">
            Add someone by email
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id="member-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              className={cn(authFieldClasses, 'flex-1')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'member-email-error' : undefined}
              data-autofocus
              disabled={adding}
            />
            <Button type="submit" loading={adding}>
              Add
            </Button>
          </div>
          <FieldError id="member-email-error" messages={fieldErrors.email} />
        </form>
        <FormError message={addError} />
        <div>
          <h3 className="text-sm font-medium text-slate-900">People with access</h3>
          <MembersPanel boardApi={boardApi} canManage />
        </div>
      </div>
    </Modal>
  );
}
