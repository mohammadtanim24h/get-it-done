'use client';

import { useState } from 'react';
import { FormError } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import type { UseBoardDetailResult } from '@/hooks/use-board-detail';
import { ApiClientError } from '@/services/api-client';
import type { BoardMember } from '@/types/models';

export interface MembersPanelProps {
  boardApi: UseBoardDetailResult;
  /** Only owners may remove members; render the affordance for them alone. */
  canManage: boolean;
}

export function MembersPanel({ boardApi, canManage }: MembersPanelProps) {
  const { board, status, loadError, removingUserId, removeMember, reload } = boardApi;
  const [pendingRemoval, setPendingRemoval] = useState<BoardMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function handleRemove() {
    if (!pendingRemoval) return;
    setRemoveError(null);
    try {
      await removeMember(pendingRemoval.userId);
      setPendingRemoval(null);
    } catch (err) {
      setRemoveError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-4" role="status" aria-live="polite">
        <Spinner className="h-5 w-5 text-slate-400" />
      </div>
    );
  }

  if (status === 'error' || status === 'not-found' || status === 'forbidden') {
    const message =
      status === 'not-found'
        ? 'This board no longer exists.'
        : status === 'forbidden'
          ? 'You do not have access to this board.'
          : loadError;
    return (
      <div className="space-y-2 py-2">
        <FormError message={message} />
        {status === 'error' && (
          <Button variant="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const ownerUserId = board?.ownerId ?? '';

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {(board?.members ?? []).map((member) => {
          const isOwner = member.userId === ownerUserId;
          return (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">{member.name}</span>
                  {isOwner && (
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Owner
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-slate-500">{member.email}</p>
              </div>
              {canManage && !isOwner && (
                <Button
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={removingUserId !== null}
                  onClick={() => {
                    setRemoveError(null);
                    setPendingRemoval(member);
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove member"
        message={
          <>
            Remove <span className="font-semibold text-slate-900">{pendingRemoval?.name}</span> (
            {pendingRemoval?.email}) from this board? They will lose access to it.
          </>
        }
        confirmLabel="Remove member"
        submitting={removingUserId !== null}
        error={removeError}
        onConfirm={handleRemove}
        onClose={() => {
          if (!removingUserId) setPendingRemoval(null);
        }}
      />
    </>
  );
}
