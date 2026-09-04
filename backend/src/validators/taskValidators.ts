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

// Movement payload for PATCH /tasks/:taskId/move. targetPosition is a
// zero-based index. Out-of-range positions are REJECTED (not clamped):
// same-column moves accept 0..n-1 (n = column task count) and
// cross-column moves accept 0..m (m = destination task count). The
// service enforces the range against live counts; the schema only
// rejects structurally invalid values (non-integer / negative).
export const moveTaskSchema = z.object({
  targetColumnId: z
    .string({ required_error: 'targetColumnId is required' })
    .min(1, 'targetColumnId is required'),
  targetPosition: z
    .number({ required_error: 'targetPosition is required', invalid_type_error: 'targetPosition must be a number' })
    .int('targetPosition must be an integer')
    .nonnegative('targetPosition must be at least 0'),
});

export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
