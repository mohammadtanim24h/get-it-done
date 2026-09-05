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

/**
 * Mirrors the backend's board title schema: trimmed, 1-120 characters.
 * See backend/src/validators/boardValidators.ts.
 */
export function validateBoardTitle(title: string): string[] {
  const errors: string[] = [];
  if (!title.trim()) {
    errors.push('title is required');
  } else if (title.trim().length > 120) {
    errors.push('title must be at most 120 characters');
  }
  return errors;
}

export interface ShareMemberInput {
  email: string;
}

/** Mirrors the backend's addBoardMemberSchema. */
export function validateShareForm({ email }: ShareMemberInput): FieldErrors {
  const errors: FieldErrors = {};
  const emailErrors = validateEmail(email);
  if (emailErrors.length > 0) errors.email = emailErrors;
  return errors;
}

/**
 * Mirrors the backend column title schema: trimmed, 1-120 characters.
 * See backend/src/validators/columnValidators.ts.
 */
export function validateColumnTitle(title: string): string[] {
  const errors: string[] = [];
  if (!title.trim()) {
    errors.push('title is required');
  } else if (title.trim().length > 120) {
    errors.push('title must be at most 120 characters');
  }
  return errors;
}

export interface TaskFormInput {
  title: string;
  description: string;
}

/**
 * Mirrors the backend task schema: title trimmed 1-120 characters,
 * optional description at most 5000 characters.
 * See backend/src/validators/taskValidators.ts.
 */
export function validateTaskForm({ title, description }: TaskFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!title.trim()) {
    errors.title = ['title is required'];
  } else if (title.trim().length > 120) {
    errors.title = ['title must be at most 120 characters'];
  }
  if (description.trim().length > 5000) {
    errors.description = ['description must be at most 5000 characters'];
  }
  return errors;
}
