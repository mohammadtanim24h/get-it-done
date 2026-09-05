'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AddTaskComposer } from './AddTaskComposer';
import { ColumnForm } from './ColumnForm';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { ApiClientError } from '@/services/api-client';
import type { ColumnWithTasks, Task } from '@/types/models';

export interface KanbanColumnProps {
  column: ColumnWithTasks;
  onRenameColumn: (columnId: string, title: string) => Promise<unknown>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onCreateTask: (columnId: string, input: { title: string }) => Promise<unknown>;
  onUpdateTask: (taskId: string, input: { title: string; description: string }) => Promise<unknown>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.';
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  onRenameColumn,
  onDeleteColumn,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: KanbanColumnProps) {
  // The task list is a drop target in its own right so empty columns (and
  // drops below the last card) still resolve to this column.
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState(false);
  const [deleteColumnError, setDeleteColumnError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingTaskDelete, setPendingTaskDelete] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);

  async function handleDeleteColumn() {
    setDeleteColumnError(null);
    setDeletingColumn(true);
    try {
      await onDeleteColumn(column.id);
      setDeleteOpen(false);
    } catch (err) {
      setDeleteColumnError(errorMessage(err));
    } finally {
      setDeletingColumn(false);
    }
  }

  async function handleDeleteTask() {
    if (!pendingTaskDelete) return;
    setDeleteTaskError(null);
    setDeletingTask(true);
    try {
      await onDeleteTask(pendingTaskDelete.id);
      setPendingTaskDelete(null);
    } catch (err) {
      setDeleteTaskError(errorMessage(err));
    } finally {
      setDeletingTask(false);
    }
  }

  return (
    <section
      aria-label={`Column ${column.title}`}
      className="flex w-64 shrink-0 flex-col self-start rounded-xl border border-slate-200 bg-slate-50 sm:w-72"
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
          {column.title}
        </h3>
        <span
          className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
          aria-label={`${column.tasks.length} tasks`}
        >
          {column.tasks.length}
        </span>
        <DropdownMenu
          buttonLabel={`Actions for column ${column.title}`}
          items={[
            { label: 'Rename column', onSelect: () => setRenameOpen(true) },
            {
              label: 'Delete column',
              onSelect: () => {
                setDeleteColumnError(null);
                setDeleteOpen(true);
              },
              danger: true,
            },
          ]}
        />
      </header>

      <ul
        ref={setNodeRef}
        className={`flex min-h-10 flex-col gap-2 rounded-lg px-3 pb-2 transition-colors ${
          isOver ? 'bg-indigo-100/70 ring-2 ring-inset ring-indigo-300' : ''
        }`}
        aria-label={`Tasks in ${column.title}`}
      >
        <SortableContext
          items={column.tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={(t) => setEditingTask(t)}
              onDelete={(t) => {
                setDeleteTaskError(null);
                setPendingTaskDelete(t);
              }}
            />
          ))}
        </SortableContext>
      </ul>
      {column.tasks.length === 0 && (
        <p className="px-3 pb-2 text-xs text-slate-400">No tasks yet</p>
      )}

      <div className="px-3 pb-3">
        <AddTaskComposer
          columnId={column.id}
          onCreateTask={(input) => onCreateTask(column.id, input)}
        />
      </div>

      <ColumnForm
        open={renameOpen}
        column={{ id: column.id, title: column.title }}
        onSubmit={async (title) => {
          await onRenameColumn(column.id, title);
        }}
        onClose={() => setRenameOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete column"
        confirmLabel="Delete column"
        submitting={deletingColumn}
        error={deleteColumnError}
        onConfirm={handleDeleteColumn}
        onClose={() => {
          if (!deletingColumn) setDeleteOpen(false);
        }}
        message={
          <>
            Delete <span className="font-semibold text-slate-900">{column.title}</span> and its{' '}
            {column.tasks.length} {column.tasks.length === 1 ? 'task' : 'tasks'}? This cannot be
            undone.
          </>
        }
      />

      <TaskForm
        open={editingTask !== null}
        task={editingTask}
        onSubmit={async (input) => {
          if (editingTask) await onUpdateTask(editingTask.id, input);
        }}
        onClose={() => setEditingTask(null)}
      />

      <ConfirmDialog
        open={pendingTaskDelete !== null}
        title="Delete task"
        confirmLabel="Delete task"
        submitting={deletingTask}
        error={deleteTaskError}
        onConfirm={handleDeleteTask}
        onClose={() => {
          if (!deletingTask) setPendingTaskDelete(null);
        }}
        message={
          <>
            Delete{' '}
            <span className="font-semibold text-slate-900">{pendingTaskDelete?.title}</span>? This
            cannot be undone.
          </>
        }
      />
    </section>
  );
});
