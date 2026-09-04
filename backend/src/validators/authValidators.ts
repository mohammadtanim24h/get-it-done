import { z } from 'zod';
import { ValidationError } from '../utils/appError';

// Email normalization: trim + lowercase so "John@Example.COM " and
// "john@example.com" are treated as the same account.
const email = z
  .string({ required_error: 'email is required' })
  .trim()
  .toLowerCase()
  .email('email must be a valid email address')
  .max(254, 'email must be at most 254 characters');

// bcrypt operates on at most 72 bytes, so cap length there.
const password = z
  .string({ required_error: 'password is required' })
  .min(8, 'password must be at least 8 characters')
  .max(72, 'password must be at most 72 characters');

const name = z
  .string({ required_error: 'name is required' })
  .trim()
  .min(1, 'name is required')
  .max(100, 'name must be at most 100 characters');

export const registerSchema = z.object({ name, email, password });

export const loginSchema = z.object({ email, password: z.string({ required_error: 'password is required' }) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Parse `data` against `schema`, throwing a ValidationError with per-field
 * details on failure so the error handler returns a consistent 400 body:
 * { error: { code: "VALIDATION_ERROR", details: { fields: { ... } } } }.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flattened = result.error.flatten().fieldErrors;
    const fields: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(flattened)) {
      if (messages && messages.length > 0) fields[key] = messages;
    }
    throw new ValidationError('Validation failed', { fields });
  }
  return result.data;
}
