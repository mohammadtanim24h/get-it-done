import { z } from 'zod';
import { email } from './authValidators';

// Titles are stored trimmed and non-empty; boards are user-facing so a
// generous but bounded length keeps lists readable.
const title = z
  .string({ required_error: 'title is required' })
  .trim()
  .min(1, 'title is required')
  .max(120, 'title must be at most 120 characters');

export const createBoardSchema = z.object({ title });

export const updateBoardSchema = z.object({ title: title.optional() });

export const addBoardMemberSchema = z.object({ email });

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type AddBoardMemberInput = z.infer<typeof addBoardMemberSchema>;
