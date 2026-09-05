'use client';

import { useEffect, useRef, useState } from 'react';
import { FieldError, FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { validateTaskForm } from '@/lib/validation';
import { ApiClientError } from '@/services/api-client';
import type { Task } from '@/types/models';

export interface TaskFormProps {
  open: boolean;
  /** Task being edited; null keeps the dialog content stable when closing. */
  task: Task | null;
  onSubmit: (input: { title: string; description: string }) => Promise<void>;
  onClose: () => void;
}

export function TaskForm({ open, task, onSubmit, onClose }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const titleRef = useRef<HTMLInputElement>(null);

  // Prefill on open and clear transient state.
  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setSubmitting(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, task]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const errors = validateTaskForm({ title, description });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      titleRef.current?.focus();
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
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
    <Modal open={open} title="Edit task" onClose={guardedClose}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <div className="space-y-1">
          <label htmlFor="task-form-title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            ref={titleRef}
            id="task-form-title"
            type="text"
            autoComplete="off"
            className={authFieldClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'task-form-title-error' : undefined}
            data-autofocus
            disabled={submitting}
          />
          <FieldError id="task-form-title-error" messages={fieldErrors.title} />
        </div>
        <div className="space-y-1">
          <label htmlFor="task-form-description" className="block text-sm font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="task-form-description"
            rows={4}
            className={authFieldClasses}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? 'task-form-description-error' : undefined}
            disabled={submitting}
          />
          <FieldError id="task-form-description-error" messages={fieldErrors.description} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={guardedClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
