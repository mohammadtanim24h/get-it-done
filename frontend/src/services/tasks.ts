import { apiClient } from './api-client';
import type { ApiEnvelope } from '@/types/api';
import type { Task } from '@/types/models';

/**
 * Task CRUD within a column. The backend appends new tasks and returns
 * lists ordered by position (docs/API.md). Task movement between columns
 * (`PATCH /tasks/:id/move`) is intentionally out of scope here until
 * drag-and-drop lands.
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
};
