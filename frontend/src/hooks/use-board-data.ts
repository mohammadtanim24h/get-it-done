'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/services/api-client';
import { columnsService } from '@/services/columns';
import { tasksService } from '@/services/tasks';
import type { BoardColumn, ColumnWithTasks, Task, TaskMoveResult } from '@/types/models';

export type BoardDataStatus = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error';

export interface TaskInput {
  title: string;
  description?: string;
}

export interface UseBoardDataResult {
  columns: ColumnWithTasks[];
  status: BoardDataStatus;
  /** Populated only for status 'error' (network/unexpected failures). */
  loadError: string | null;
  createColumn: (title: string) => Promise<BoardColumn>;
  renameColumn: (columnId: string, title: string) => Promise<BoardColumn>;
  deleteColumn: (columnId: string) => Promise<void>;
  createTask: (columnId: string, input: TaskInput) => Promise<Task>;
  updateTask: (taskId: string, input: TaskInput) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  /**
   * Optimistically moves a task, then reconciles with the backend's
   * authoritative ordering. Reverts to the pre-move snapshot on failure
   * (a 409 also triggers a refetch) and rethrows so callers can surface
   * the error. Moves for a task with a request already in flight are
   * ignored.
   */
  moveTask: (taskId: string, targetColumnId: string, targetPosition: number) => Promise<void>;
  reload: () => Promise<void>;
}

/** Removes the task from its column and inserts it at the target index. */
function applyOptimisticMove(
  columns: ColumnWithTasks[],
  taskId: string,
  targetColumnId: string,
  targetPosition: number,
): ColumnWithTasks[] {
  let moved: Task | undefined;
  const withoutTask = columns.map((column) => {
    const index = column.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return column;
    moved = column.tasks[index];
    return { ...column, tasks: column.tasks.filter((task) => task.id !== taskId) };
  });
  if (!moved) return columns;
  const movedTask = { ...moved, columnId: targetColumnId };
  return withoutTask.map((column) => {
    if (column.id !== targetColumnId) return column;
    const tasks = column.tasks.slice();
    tasks.splice(Math.min(targetPosition, tasks.length), 0, movedTask);
    return { ...column, tasks };
  });
}

/**
 * Replaces both affected columns' task lists with the backend's post-move
 * ordering. The backend is the source of truth — the frontend never
 * recomputes final positions itself.
 */
function applyMoveResult(
  columns: ColumnWithTasks[],
  result: TaskMoveResult,
): ColumnWithTasks[] {
  const tasksById = new Map<string, Task>();
  for (const column of columns) {
    for (const task of column.tasks) tasksById.set(task.id, task);
  }
  tasksById.set(result.task.id, result.task);
  const orderings = new Map([
    [result.sourceColumn.id, result.sourceColumn.tasks],
    [result.destinationColumn.id, result.destinationColumn.tasks],
  ]);
  return columns.map((column) => {
    const ordering = orderings.get(column.id);
    if (!ordering) return column;
    const tasks = ordering.flatMap((entry) => {
      const task = tasksById.get(entry.id);
      return task ? [{ ...task, position: entry.position, columnId: column.id }] : [];
    });
    return { ...column, tasks };
  });
}

/**
 * Fetches a board's columns with their tasks nested, and owns all column and
 * task mutations. Local state is only updated after the API succeeds; errors
 * propagate to callers (components surface them inline). The backend returns
 * both columns and tasks ordered by position, so list order is preserved as
 * the canonical order. There is no bulk endpoint — tasks are fetched per
 * column in parallel.
 */
export function useBoardData(boardId: string | null): UseBoardDataResult {
  const [columns, setColumns] = useState<ColumnWithTasks[]>([]);
  const [status, setStatus] = useState<BoardDataStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Guards against stale responses when the board id changes mid-flight.
  const requestSeq = useRef(0);
  // Latest columns, readable inside moveTask's rollback without re-creating the callback.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  // Task ids with a move request in flight — duplicates are dropped.
  const pendingMoves = useRef(new Set<string>());

  const reload = useCallback(async () => {
    if (!boardId) return;
    const seq = ++requestSeq.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const loadedColumns = await columnsService.listColumns(boardId);
      const taskLists = await Promise.all(
        loadedColumns.map((column) => tasksService.listTasks(column.id)),
      );
      if (seq !== requestSeq.current) return;
      setColumns(
        loadedColumns.map((column, index) => ({ ...column, tasks: taskLists[index] })),
      );
      setStatus('ready');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setStatus('not-found');
          return;
        }
        if (err.status === 403) {
          setStatus('forbidden');
          return;
        }
        setLoadError(err.message);
      } else {
        setLoadError('Something went wrong. Please try again.');
      }
      setStatus('error');
    }
  }, [boardId]);

  useEffect(() => {
    if (!boardId) {
      setColumns([]);
      setStatus('loading');
      setLoadError(null);
      return;
    }
    void reload();
  }, [boardId, reload]);

  const createColumn = useCallback(
    async (title: string) => {
      if (!boardId) throw new Error('No board selected.');
      const column = await columnsService.createColumn(boardId, { title });
      // The backend appends new columns at the end.
      setColumns((prev) => [...prev, { ...column, tasks: [] }]);
      return column;
    },
    [boardId],
  );

  const renameColumn = useCallback(
    async (columnId: string, title: string) => {
      if (!boardId) throw new Error('No board selected.');
      const column = await columnsService.renameColumn(boardId, columnId, { title });
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, ...column, tasks: c.tasks } : c)),
      );
      return column;
    },
    [boardId],
  );

  const deleteColumn = useCallback(
    async (columnId: string) => {
      if (!boardId) throw new Error('No board selected.');
      await columnsService.deleteColumn(boardId, columnId);
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
    },
    [boardId],
  );

  const createTask = useCallback(async (columnId: string, input: TaskInput) => {
    // The backend appends new tasks at the end of the column.
    const task = await tasksService.createTask(columnId, input);
    setColumns((prev) =>
      prev.map((c) => (c.id === task.columnId ? { ...c, tasks: [...c.tasks, task] } : c)),
    );
    return task;
  }, []);

  const updateTask = useCallback(async (taskId: string, input: TaskInput) => {
    const task = await tasksService.updateTask(taskId, input);
    setColumns((prev) =>
      prev.map((c) =>
        c.id === task.columnId
          ? { ...c, tasks: c.tasks.map((t) => (t.id === task.id ? task : t)) }
          : c,
      ),
    );
    return task;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await tasksService.deleteTask(taskId);
    setColumns((prev) =>
      prev.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) })),
    );
  }, []);

  const moveTask = useCallback(
    async (taskId: string, targetColumnId: string, targetPosition: number) => {
      if (pendingMoves.current.has(taskId)) return;
      const snapshot = columnsRef.current;
      pendingMoves.current.add(taskId);
      setColumns((prev) =>
        applyOptimisticMove(prev, taskId, targetColumnId, targetPosition),
      );
      try {
        const result = await tasksService.moveTask(taskId, {
          targetColumnId,
          targetPosition,
        });
        setColumns((prev) => applyMoveResult(prev, result));
      } catch (err) {
        setColumns(snapshot);
        // 409 means the board changed under us (contended move) — the
        // snapshot itself may be stale, so refetch authoritative state.
        if (err instanceof ApiClientError && err.status === 409) {
          void reload();
        }
        throw err;
      } finally {
        pendingMoves.current.delete(taskId);
      }
    },
    [reload],
  );

  return {
    columns,
    status,
    loadError,
    createColumn,
    renameColumn,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    reload,
  };
}
