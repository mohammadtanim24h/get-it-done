'use client';

// Root provider composition. Auth/session providers will be added in a later phase.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
