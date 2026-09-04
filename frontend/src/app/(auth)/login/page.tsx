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
import { Button } from '@/components/button';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/services/api-client';
import { validateLoginForm } from '@/lib/validation';

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/boards');
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const errors = validateLoginForm({ email, password });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      await login({ email, password });
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
      title="Sign in"
      subtitle="Welcome back to Get It Done"
      footer={
        <>
          No account yet?{' '}
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Create one
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
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
            autoComplete="current-password"
            required
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={authFieldClasses}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError id="password-error" messages={fieldErrors.password} />
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthFormShell>
  );
}
