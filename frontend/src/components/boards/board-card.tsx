'use client';

import Link from 'next/link';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/format';
import type { BoardSummary } from '@/types/models';

export interface BoardCardProps {
  board: BoardSummary;
  onRename: (board: BoardSummary) => void;
  onShare: (board: BoardSummary) => void;
  onDelete: (board: BoardSummary) => void;
}

export function BoardCard({ board, onRename, onShare, onDelete }: BoardCardProps) {
  const isOwner = board.role === 'owner';

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300">
      {/* Stretched link: the entire card opens the board. */}
      <Link
        href={`/boards/${board.id}`}
        aria-label={`Open ${board.title}`}
        className="absolute inset-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
          {board.title}
        </h2>
        {isOwner && (
          <DropdownMenu
            buttonLabel={`Actions for ${board.title}`}
            items={[
              { label: 'Rename', onSelect: () => onRename(board) },
              { label: 'Share', onSelect: () => onShare(board) },
              { label: 'Delete', onSelect: () => onDelete(board), danger: true },
            ]}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        {isOwner ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Owner
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Shared with you
          </span>
        )}
        <span className="text-xs text-slate-500">Updated {formatDate(board.updatedAt)}</span>
      </div>
    </div>
  );
}
