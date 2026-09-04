'use client';

import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
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
        <Link href="/boards" className={buttonClasses()}>
          Go to your boards
        </Link>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className={buttonClasses()}>
            Sign in
          </Link>
          <Link href="/register" className={buttonClasses('secondary')}>
            Create account
          </Link>
        </div>
      )}
    </main>
  );
}
