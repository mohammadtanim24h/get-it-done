'use client';

import { useCallback, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ColumnForm } from './ColumnForm';
import { computeMoveIntent } from './compute-move';
import { KanbanColumn } from './KanbanColumn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiClientError } from '@/services/api-client';
import type { UseBoardDataResult } from '@/hooks/use-board-data';

export interface BoardViewProps {
  dataApi: UseBoardDataResult;
}

export function BoardView({ dataApi }: BoardViewProps) {
  const {
    columns,
    status,
    loadError,
    reload,
    createColumn,
    renameColumn,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
  } = dataApi;
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // PointerSensor (with a small distance threshold so clicks on card buttons
  // don't start drags) covers mouse and touch; KeyboardSensor gives the same
  // interactions via space/enter + arrow keys on the drag handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const intent = computeMoveIntent(
        columns,
        String(event.active.id),
        String(event.over?.id ?? ''),
      );
      if (!intent) return;
      setMoveError(null);
      moveTask(intent.taskId, intent.targetColumnId, intent.targetPosition).catch((err) => {
        setMoveError(
          err instanceof ApiClientError
            ? err.message
            : 'Something went wrong while moving the task. Please try again.',
        );
      });
    },
    [columns, moveTask],
  );

  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);

  if (status === 'loading') {
    return (
      <div className="flex gap-4 overflow-hidden pb-4" role="status" aria-label="Loading board">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-64 w-64 shrink-0 animate-pulse rounded-xl border border-slate-200 bg-slate-100 sm:w-72"
          />
        ))}
      </div>
    );
  }

  if (status !== 'ready') {
    const message =
      status === 'not-found'
        ? "This board doesn't exist or may have been deleted."
        : status === 'forbidden'
          ? "You don't have access to this board."
          : loadError;
    return <ErrorState message={message} onRetry={() => void reload()} />;
  }

  const addColumnForm = (
    <ColumnForm
      open={addColumnOpen}
      column={null}
      onSubmit={async (title) => {
        await createColumn(title);
      }}
      onClose={() => setAddColumnOpen(false)}
    />
  );

  if (columns.length === 0) {
    return (
      <>
        <EmptyState
          title="No columns yet"
          description="Add your first column to start tracking work."
          action={<Button onClick={() => setAddColumnOpen(true)}>Add column</Button>}
        />
        {addColumnForm}
      </>
    );
  }

  return (
    <section aria-labelledby="board-canvas-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="board-canvas-heading" className="text-sm font-semibold text-slate-900">
          Board
        </h2>
        <Button variant="secondary" onClick={() => setAddColumnOpen(true)}>
          Add column
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {columns.length} {columns.length === 1 ? 'column' : 'columns'}, {totalTasks}{' '}
        {totalTasks === 1 ? 'task' : 'tasks'}
      </p>
      {moveError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <p className="min-w-0 break-words">Couldn&apos;t move the task. {moveError}</p>
          <Button variant="ghost" className="shrink-0 px-2 py-1" onClick={() => setMoveError(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <div className="-mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-4">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
              onCreateTask={createTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          ))}
        </div>
      </DndContext>
      {addColumnForm}
    </section>
  );
}
