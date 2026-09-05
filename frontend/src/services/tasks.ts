import { apiClient } from './api-client';
import type { ApiEnvelope } from '@/types/api';
import type { Task, TaskMoveResult } from '@/types/models';

/**
 * Task CRUD within a column. The backend appends new tasks and returns
 * lists ordered by position (docs/API.md).
 */
export const tasksService = {
  async listTasks(columnId: string): Promise<Task[]> {
    const { data } = await apiClient.get<ApiEnvelope<{ tasks: Task[] }>>(
      `/columns/${columnId}/tasks`,
    );
    return data.tasks;
  },

  async createTask(
    columnId: string,
    input: { title: string; description?: string },
  ): Promise<Task> {
    const { data } = await apiClient.post<ApiEnvelope<{ task: Task }>>(
      `/columns/${columnId}/tasks`,
      input,
    );
    return data.task;
  },

  async updateTask(
    taskId: string,
    input: { title?: string; description?: string },
  ): Promise<Task> {
    const { data } = await apiClient.patch<ApiEnvelope<{ task: Task }>>(
      `/tasks/${taskId}`,
      input,
    );
    return data.task;
  },

  async deleteTask(taskId: string): Promise<void> {
    await apiClient.delete(`/tasks/${taskId}`);
  },

  /**
   * Move a task within or between columns. `targetPosition` is a zero-based
   * index into the target column (same-column: `0..n-1`, cross-column:
   * `0..m`). The backend is the source of truth for ordering — the response
   * carries the full post-move ordering of both affected columns.
   */
  async moveTask(
    taskId: string,
    input: { targetColumnId: string; targetPosition: number },
  ): Promise<TaskMoveResult> {
    const { data } = await apiClient.patch<ApiEnvelope<TaskMoveResult>>(
      `/tasks/${taskId}/move`,
      input,
    );
    return data;
  },
};
