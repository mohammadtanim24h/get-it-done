'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MembersPanel } from '@/components/boards/members-panel';
import { RenameBoardDialog } from '@/components/boards/rename-board-dialog';
import { ShareBoardDialog } from '@/components/boards/share-board-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useBoardDetail } from '@/hooks/use-board-detail';
import { formatDate } from '@/lib/format';

export default function BoardDetailPage() {
  const params = useParams<{ boardId: string }>();
  const boardApi = useBoardDetail(params.boardId);
  const { board, status, loadError, reload } = boardApi;

  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // The hook owns board state; renames are applied locally on top so the
  // header updates without a refetch.
  const [renamed, setRenamed] = useState<{ title: string; updatedAt: string } | null>(null);

  // The App Router reuses this component across board ids without remounting,
  // so a rename override from one board must not leak into another.
  useEffect(() => {
    setRenamed(null);
  }, [params.boardId]);

  const isOwner = board !== null && board.role === 'owner';
  const title = renamed?.title ?? board?.title ?? '';
  const updatedAt = renamed?.updatedAt ?? board?.updatedAt ?? '';

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-md bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  if (status === 'not-found' || status === 'forbidden') {
    return (
      <div className="space-y-6">
        <ErrorState
          title={status === 'not-found' ? 'Board not found' : 'No access'}
          message={
            status === 'not-found'
              ? "This board doesn't exist or may have been deleted."
              : "You don't have access to this board."
          }
        />
        <Link href="/boards" className={buttonClasses('secondary')}>
          Back to boards
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <ErrorState message={loadError} onRetry={() => void reload()} />
        <Link href="/boards" className={buttonClasses('secondary')}>
          Back to boards
        </Link>
      </div>
    );
  }

  if (board === null) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/boards"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        ← Back to boards
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
            <span
              className={
                isOwner
                  ? 'inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700'
                  : 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600'
              }
            >
              {isOwner ? 'Owner' : 'Member'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Updated {formatDate(updatedAt)}</p>
        </div>

        {/* Owner-only actions are simply not rendered for members. */}
        {isOwner && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
            <Button variant="secondary" onClick={() => setShareOpen(true)}>
              Share
            </Button>
          </div>
        )}
      </div>

      <section
        aria-labelledby="members-heading"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 id="members-heading" className="text-sm font-semibold text-slate-900">
          Members
        </h2>
        <div className="mt-1">
          <MembersPanel boardApi={boardApi} canManage={isOwner} />
        </div>
      </section>

      <EmptyState
        title="Tasks come next"
        description="Columns and the drag-and-drop task board arrive in the next phase."
      />

      <RenameBoardDialog
        open={renameOpen}
        board={board}
        onClose={() => setRenameOpen(false)}
        onRenamed={(updated) =>
          setRenamed({ title: updated.title, updatedAt: updated.updatedAt })
        }
      />
      <ShareBoardDialog open={shareOpen} boardApi={boardApi} onClose={() => setShareOpen(false)} />
    </div>
  );
}
