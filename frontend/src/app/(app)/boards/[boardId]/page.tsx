import { EmptyState } from '@/components/ui/empty-state';

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Board</h1>
        <p className="text-sm text-slate-500">
          The board view for <code className="rounded bg-slate-100 px-1">{boardId}</code> arrives
          in the next phase.
        </p>
      </div>
      <EmptyState
        title="Board view coming soon"
        description="Columns, tasks, and drag-and-drop land in the next phase."
      />
    </div>
  );
}
