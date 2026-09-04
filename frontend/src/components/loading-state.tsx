import { Spinner } from './spinner';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8 text-indigo-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
