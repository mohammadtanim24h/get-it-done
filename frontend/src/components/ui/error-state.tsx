import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center"
      role="alert"
    >
      <h2 className="text-base font-semibold text-red-800">{title}</h2>
      {message && <p className="max-w-md text-sm text-red-600">{message}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
