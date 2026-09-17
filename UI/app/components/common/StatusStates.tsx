import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function LoadingSpinner({ message = 'Loading live data from AgentGuard...' }: { message?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--muted)]">
      <Loader2 className="size-6 animate-spin text-[var(--cyan)]" />
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
    <div className="flex items-start gap-3 rounded-xl border border-[#ff6d7a44] bg-[#ff6d7a10] p-4 text-xs text-[#ff6d7a]">
      <AlertCircle className="size-5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">Failed to communicate with AgentGuard API</div>
        <p className="mt-1 text-[#ff6d7a]/80">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded border border-[#ff6d7a66] bg-[#ff6d7a22] px-2.5 py-1.5 font-medium transition hover:bg-[#ff6d7a33]"
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
      <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04] text-[var(--muted)]">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-lg bg-[var(--cyan)] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
