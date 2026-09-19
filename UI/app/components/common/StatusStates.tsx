import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function LoadingSpinner({ message = 'Loading live data from AgentGuard...' }: { message?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center text-sm font-medium text-[var(--text)]">
      <Loader2 className="size-6 animate-spin text-[#134e56]" />
      <span>{message}</span>
    </div>
  );
}

export function ErrorAlert({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--line)] bg-[var(--red)]/20 p-4 text-xs shadow-[2px_2px_0_var(--line)]">
      <AlertCircle className="size-5 shrink-0 text-[#8a1936]" />
      <div className="flex-1">
        <div className="font-bold text-[var(--text)]">Failed to communicate with AgentGuard API</div>
        <p className="mt-1 font-medium text-[#8a1936]">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--red)] px-2.5 py-1.5 font-bold text-[var(--text)] shadow-[1px_1px_0_var(--line)] transition hover:opacity-90 cursor-pointer"
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-bold text-base text-[var(--text)]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 font-medium text-[var(--muted)]">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-3.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
