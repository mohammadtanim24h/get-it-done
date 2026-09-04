'use client';

import Link from 'next/link';
import { Button } from '@/components/button';
import { LoadingState } from '@/components/loading-state';
import { useAuth } from '@/hooks/use-auth';

export default function HomePage() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingState label="Loading Get It Done…" />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-50 to-white p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Get It Done</h1>
      <p className="max-w-md text-slate-600">
        A mini Kanban board for getting things done. Organize work into boards,
        columns, and tasks.
      </p>
      {status === 'authenticated' ? (
        <Link href="/boards" tabIndex={-1}>
          <Button>Go to your boards</Button>
        </Link>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" tabIndex={-1}>
            <Button>Sign in</Button>
          </Link>
          <Link href="/register" tabIndex={-1}>
            <Button variant="secondary">Create account</Button>
          </Link>
        </div>
      )}
    </main>
  );
}
