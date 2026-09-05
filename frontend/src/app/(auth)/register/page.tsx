'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  authFieldClasses,
  AuthFormShell,
  FieldError,
  FormError,
} from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/services/api-client';
import { validateRegisterForm } from '@/lib/validation';

export default function RegisterPage() {
  const { status, register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/boards');
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const errors = validateRegisterForm({ name, email, password });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstInvalid = errors.name ? nameRef : errors.email ? emailRef : passwordRef;
      firstInvalid.current?.focus();
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      await register({ name, email, password });
      router.replace('/boards');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormShell
      title="Create account"
      subtitle="Get started with Get It Done"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            ref={nameRef}
            id="name"
            type="text"
            autoComplete="name"
            required
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            className={authFieldClasses}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
          <FieldError id="name-error" messages={fieldErrors.name} />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            ref={emailRef}
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={authFieldClasses}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
          <FieldError id="email-error" messages={fieldErrors.email} />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            ref={passwordRef}
            id="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={authFieldClasses}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
          <FieldError id="password-error" messages={fieldErrors.password} />
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthFormShell>
  );
}
