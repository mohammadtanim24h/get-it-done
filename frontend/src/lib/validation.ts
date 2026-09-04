import type { LoginInput, RegisterInput } from '@/services/auth';

/**
 * Client-side mirrors of the backend's zod schemas (see
 * backend/src/validators/authValidators.ts). They exist to fail fast with
 * the same messages the API would return; the backend remains the source
 * of truth.
 */

type FieldErrors = Record<string, string[]>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string[] {
  const errors: string[] = [];
  if (!email.trim()) {
    errors.push('email is required');
    return errors;
  }
  if (!EMAIL_RE.test(email.trim())) {
    errors.push('email must be a valid email address');
  } else if (email.trim().length > 254) {
    errors.push('email must be at most 254 characters');
  }
  return errors;
}

export function validateLoginForm({ email, password }: LoginInput): FieldErrors {
  const errors: FieldErrors = {};
  const emailErrors = validateEmail(email);
  if (emailErrors.length > 0) errors.email = emailErrors;
  if (!password) errors.password = ['password is required'];
  return errors;
}

export function validateRegisterForm({ name, email, password }: RegisterInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) {
    errors.name = ['name is required'];
  } else if (name.trim().length > 100) {
    errors.name = ['name must be at most 100 characters'];
  }
  const emailErrors = validateEmail(email);
  if (emailErrors.length > 0) errors.email = emailErrors;
  if (password.length < 8) {
    errors.password = ['password must be at least 8 characters'];
  } else if (password.length > 72) {
    errors.password = ['password must be at most 72 characters'];
  }
  return errors;
}
