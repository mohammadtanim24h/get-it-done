'use client';

import { useCallback, useEffect, useState } from 'react';
import { BoardCard } from '@/components/boards/board-card';
import { CreateBoardDialog } from '@/components/boards/create-board-dialog';
import { DeleteBoardDialog } from '@/components/boards/delete-board-dialog';
import { ShareBoardDialog } from '@/components/boards/share-board-dialog';
import { RenameBoardDialog } from '@/components/boards/rename-board-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useBoardDetail } from '@/hooks/use-board-detail';
import { ApiClientError } from '@/services/api-client';
import { boardsService } from '@/services/boards';
import type { BoardSummary } from '@/types/models';

type ListStatus = 'loading' | 'ready' | 'error';

export default function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<BoardSummary | null>(null);
  const [deleting, setDeleting] = useState<BoardSummary | null>(null);
  const [sharing, setSharing] = useState<BoardSummary | null>(null);

  // Idles while no share dialog is open; fetches the board (members) when
  // one is, so the dialog always shows current membership.
  const shareBoardApi = useBoardDetail(sharing?.id ?? null);

  const loadBoards = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      setBoards(await boardsService.listBoards());
      setStatus('ready');
    } catch (err) {
      setLoadError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
          <p className="text-sm text-slate-500">Boards you own or are a member of.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New board</Button>
      </div>

      {status === 'loading' && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading boards"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      )}

      {status === 'error' && <ErrorState message={loadError} onRetry={() => void loadBoards()} />}

      {status === 'ready' && boards.length === 0 && (
        <EmptyState
          title="No boards yet"
          description="Create your first board to start organizing tasks."
          action={<Button onClick={() => setCreateOpen(true)}>Create a board</Button>}
        />
      )}

      {status === 'ready' && boards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onRename={setRenaming}
              onShare={setSharing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <CreateBoardDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void loadBoards()}
      />
      <RenameBoardDialog
        open={renaming !== null}
        board={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => void loadBoards()}
      />
      <DeleteBoardDialog
        open={deleting !== null}
        board={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => void loadBoards()}
      />
      <ShareBoardDialog
        open={sharing !== null}
        boardApi={shareBoardApi}
        onClose={() => setSharing(null)}
      />
    </div>
  );
}
