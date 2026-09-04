'use client';

import { FormError } from '@/components/auth/auth-form';
import { Button } from './button';
import { Modal } from './modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirmation for destructive actions. Both close paths are guarded while
 * `submitting` so the dialog cannot be dismissed mid-mutation.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  submitting = false,
  error = null,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const guardedClose = () => {
    if (!submitting) onClose();
  };

  return (
    <Modal open={open} title={title} onClose={guardedClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{message}</p>
        {error && <FormError message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={guardedClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={submitting}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
