import { z } from 'zod';

// Same title rules as boards: stored trimmed and non-empty, bounded length.
const title = z
  .string({ required_error: 'title is required' })
  .trim()
  .min(1, 'title is required')
  .max(120, 'title must be at most 120 characters');

// Position is intentionally absent: it is assigned by the backend
// (append-to-end) and can only change via the future move endpoint.
export const createColumnSchema = z.object({ title });

export const updateColumnSchema = z.object({ title: title.optional() });

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
