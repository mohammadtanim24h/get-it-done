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

export default function RegisterPage() {
  const { status, register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
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
            id="name"
            type="text"
            autoComplete="name"
            required
            className={authFieldClasses}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError messages={fieldErrors.name} />
        </div>
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
            autoComplete="new-password"
            required
            minLength={8}
            className={authFieldClasses}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError messages={fieldErrors.password} />
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthFormShell>
  );
}
