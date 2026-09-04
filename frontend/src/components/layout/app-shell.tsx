'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/button';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/boards"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            Get It Done
          </Link>

          <nav className="flex items-center gap-4" aria-label="Main navigation">
            <Link
              href="/boards"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Boards
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span
                  className="hidden max-w-40 truncate text-sm text-slate-600 sm:inline"
                  title={user.email}
                >
                  {user.name}
                </span>
                <Button variant="secondary" onClick={logout}>
                  Sign out
                </Button>
              </>
            ) : (
              <Link href="/login" tabIndex={-1}>
                <Button>Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
