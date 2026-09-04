'use client';

import { useEffect, useState } from 'react';
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

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (status === 'authenticated') router.replace('/boards');
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
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
            id="email"
            type="email"
            autoComplete="email"
            required
            className={authFieldClasses}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError messages={fieldErrors.email} />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className={authFieldClasses}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError messages={fieldErrors.password} />
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthFormShell>
  );
}
