import { describe, expect, it } from 'vitest';
import {
  validateBoardTitle,
  validateColumnTitle,
  validateLoginForm,
  validateRegisterForm,
  validateShareForm,
  validateTaskForm,
} from './validation';

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

describe('validateBoardTitle', () => {
  it('accepts a normal title', () => {
    expect(validateBoardTitle('Roadmap')).toEqual([]);
  });

  it('requires a non-empty title', () => {
    expect(validateBoardTitle('')).toEqual(['title is required']);
    expect(validateBoardTitle('   ')).toEqual(['title is required']);
  });

  it('rejects titles over 120 characters', () => {
    expect(validateBoardTitle('a'.repeat(121))).toEqual([
      'title must be at most 120 characters',
    ]);
  });

  it('measures length after trimming', () => {
    expect(validateBoardTitle(`${'a'.repeat(120)}   `)).toEqual([]);
  });
});

describe('validateShareForm', () => {
  it('requires an email', () => {
    expect(validateShareForm({ email: '' })).toEqual({ email: ['email is required'] });
  });

  it('rejects an invalid email', () => {
    expect(validateShareForm({ email: 'not-an-email' })).toEqual({
      email: ['email must be a valid email address'],
    });
  });

  it('accepts a valid email', () => {
    expect(validateShareForm({ email: 'ada@example.com' })).toEqual({});
  });
});

describe('validateColumnTitle', () => {
  it('accepts a normal title', () => {
    expect(validateColumnTitle('To Do')).toEqual([]);
  });

  it('rejects empty and whitespace-only titles', () => {
    expect(validateColumnTitle('')).toEqual(['title is required']);
    expect(validateColumnTitle('   ')).toEqual(['title is required']);
  });

  it('rejects titles over 120 characters', () => {
    expect(validateColumnTitle('a'.repeat(121))).toEqual([
      'title must be at most 120 characters',
    ]);
  });
});

describe('validateTaskForm', () => {
  it('accepts a title with no description', () => {
    expect(validateTaskForm({ title: 'Write tests', description: '' })).toEqual({});
  });

  it('rejects an empty title', () => {
    expect(validateTaskForm({ title: '  ', description: '' })).toEqual({
      title: ['title is required'],
    });
  });

  it('rejects titles over 120 characters', () => {
    expect(validateTaskForm({ title: 'a'.repeat(121), description: '' })).toEqual({
      title: ['title must be at most 120 characters'],
    });
  });

  it('rejects descriptions over 5000 characters', () => {
    expect(validateTaskForm({ title: 'Ok', description: 'a'.repeat(5001) })).toEqual({
      description: ['description must be at most 5000 characters'],
    });
  });
});
