'use client';

import { useRef, useState } from 'react';
import { FormError, authFieldClasses } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { validateTaskForm } from '@/lib/validation';
import { ApiClientError } from '@/services/api-client';

export interface AddTaskComposerProps {
  /** Used for unique element ids — one composer per column. */
  columnId: string;
  onCreateTask: (input: { title: string }) => Promise<unknown>;
}

/**
 * Inline quick-add at the bottom of a column: title-first textarea, Enter
 * submits, Shift+Enter inserts a newline, Escape cancels. Stays open after a
 * successful add for rapid capture.
 */
export function AddTaskComposer({ columnId, onCreateTask }: AddTaskComposerProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function openComposer() {
    setOpen(true);
    setTitle('');
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    setTitle('');
    setError(null);
  }

  async function submit() {
    setError(null);
    const errors = validateTaskForm({ title, description: '' });
    if (errors.title) {
      setError(errors.title[0]);
      textareaRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await onCreateTask({ title: title.trim() });
      setTitle('');
      textareaRef.current?.focus();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openComposer}
        className="w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-slate-500 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        + Add task
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`add-task-${columnId}`} className="sr-only">
        New task title
      </label>
      <textarea
        ref={textareaRef}
        id={`add-task-${columnId}`}
        rows={2}
        className={authFieldClasses}
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-invalid={error ? true : undefined}
        disabled={submitting}
      />
      {/* FormError renders role="alert", which announces the message without
          an aria-describedby linkage. */}
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="button" onClick={() => void submit()} loading={submitting}>
          Add task
        </Button>
        <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-slate-500">Enter to add · Shift+Enter for a new line · Esc to cancel</p>
    </div>
  );
}
