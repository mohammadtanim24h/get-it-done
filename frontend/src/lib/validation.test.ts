import { describe, expect, it } from 'vitest';
import { validateLoginForm, validateRegisterForm } from './validation';

describe('validateLoginForm', () => {
  it('passes for valid credentials', () => {
    expect(
      validateLoginForm({ email: 'ada@example.com', password: 'password123' }),
    ).toEqual({});
  });

  it('rejects a missing email', () => {
    const errors = validateLoginForm({ email: '', password: 'password123' });
    expect(errors.email).toEqual(['email is required']);
    expect(errors.password).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    const errors = validateLoginForm({ email: 'not-an-email', password: 'password123' });
    expect(errors.email).toEqual(['email must be a valid email address']);
  });

  it('rejects a missing password without length rules (login only checks presence)', () => {
    const errors = validateLoginForm({ email: 'ada@example.com', password: '' });
    expect(errors.password).toEqual(['password is required']);
  });

  it('accepts any non-empty password, even short (length is a register-only rule)', () => {
    expect(
      validateLoginForm({ email: 'ada@example.com', password: 'x' }),
    ).toEqual({});
  });
});

describe('validateRegisterForm', () => {
  const valid = { name: 'Ada', email: 'ada@example.com', password: 'password123' };

  it('passes for valid input', () => {
    expect(validateRegisterForm(valid)).toEqual({});
  });

  it('rejects a blank name', () => {
    const errors = validateRegisterForm({ ...valid, name: '   ' });
    expect(errors.name).toEqual(['name is required']);
  });

  it('rejects a name over 100 characters', () => {
    const errors = validateRegisterForm({ ...valid, name: 'a'.repeat(101) });
    expect(errors.name).toEqual(['name must be at most 100 characters']);
  });

  it('rejects an invalid email', () => {
    const errors = validateRegisterForm({ ...valid, email: 'nope' });
    expect(errors.email).toEqual(['email must be a valid email address']);
  });

  it('rejects an email over 254 characters', () => {
    const longEmail = `${'a'.repeat(250)}@x.co`;
    const errors = validateRegisterForm({ ...valid, email: longEmail });
    expect(errors.email).toEqual(['email must be at most 254 characters']);
  });

  it('rejects a short password', () => {
    const errors = validateRegisterForm({ ...valid, password: 'short' });
    expect(errors.password).toEqual(['password must be at least 8 characters']);
  });

  it('rejects a password over 72 characters', () => {
    const errors = validateRegisterForm({ ...valid, password: 'a'.repeat(73) });
    expect(errors.password).toEqual(['password must be at most 72 characters']);
  });

  it('collects errors from multiple fields', () => {
    const errors = validateRegisterForm({ name: '', email: 'bad', password: 'x' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
  });
});
