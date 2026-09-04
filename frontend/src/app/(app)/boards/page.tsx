import { EmptyState } from '@/components/empty-state';

export default function BoardsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
        <p className="text-sm text-slate-500">
          Boards you own or are a member of.
        </p>
      </div>
      <EmptyState
        title="No boards yet"
        description="Board creation and management arrive in the next phase."
      />
    </div>
  );
}
