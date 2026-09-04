import { z } from 'zod';

const title = z
  .string({ required_error: 'title is required' })
  .trim()
  .min(1, 'title is required')
  .max(120, 'title must be at most 120 characters');

// Description is free-form text; kept bounded to avoid unbounded rows.
const description = z.string().trim().max(5000, 'description must be at most 5000 characters').optional();

// Position/columnId are intentionally absent: position is assigned by the
// backend (append-to-end) and parentage comes from the route, never the body.
export const createTaskSchema = z.object({ title, description });

export const updateTaskSchema = z.object({ title: title.optional(), description });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
