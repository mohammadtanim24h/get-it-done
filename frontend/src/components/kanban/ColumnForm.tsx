'use client';

import { useEffect, useRef, useState } from 'react';
import { FieldError, FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { validateColumnTitle } from '@/lib/validation';
import { ApiClientError } from '@/services/api-client';

export interface ColumnFormProps {
  open: boolean;
  /** Existing column when renaming; null when creating. */
  column: { id: string; title: string } | null;
  /** Performs the mutation; resolving closes the dialog, rejecting shows the error. */
  onSubmit: (title: string) => Promise<void>;
  onClose: () => void;
}

export function ColumnForm({ open, column, onSubmit, onClose }: ColumnFormProps) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill on open and clear transient state.
  useEffect(() => {
    if (open) {
      setTitle(column?.title ?? '');
      setSubmitting(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, column]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const titleErrors = validateColumnTitle(title);
    if (titleErrors.length > 0) {
      setFieldErrors({ title: titleErrors });
      inputRef.current?.focus();
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit(title.trim());
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
    <Modal open={open} title={column ? 'Rename column' : 'Add column'} onClose={guardedClose}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <div className="space-y-1">
          <label htmlFor="column-form-title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            ref={inputRef}
            id="column-form-title"
            type="text"
            autoComplete="off"
            className={authFieldClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'column-form-title-error' : undefined}
            data-autofocus
            disabled={submitting}
          />
          <FieldError id="column-form-title-error" messages={fieldErrors.title} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={guardedClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {column ? 'Save changes' : 'Add column'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
