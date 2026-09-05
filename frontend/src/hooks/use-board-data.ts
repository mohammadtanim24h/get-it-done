'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/services/api-client';
import { columnsService } from '@/services/columns';
import { tasksService } from '@/services/tasks';
import type { BoardColumn, ColumnWithTasks, Task } from '@/types/models';

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
  reload: () => Promise<void>;
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
    reload,
  };
}
