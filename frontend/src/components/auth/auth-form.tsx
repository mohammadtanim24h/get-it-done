import { cn } from '@/lib/utils';

export const authFieldClasses =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="text-sm text-red-600" role="alert">
      {messages.join(' ')}
    </p>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      {message}
    </div>
  );
}

export function AuthFormShell({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div
        className={cn(
          'w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm',
          className,
        )}
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </main>
  );
}
