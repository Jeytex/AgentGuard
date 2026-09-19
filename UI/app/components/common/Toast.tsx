import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  detail?: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';
  const isWarning = toast.type === 'warning';

  const iconBg = isSuccess
    ? 'bg-[var(--green)] text-[#26541b]'
    : isError
      ? 'bg-[var(--red)] text-[#8a1936]'
      : isWarning
        ? 'bg-[var(--amber)] text-[#6d4508]'
        : 'bg-[var(--cyan)] text-[#134e56]';
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className="flex min-w-[320px] max-w-md items-start gap-3 rounded-2xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 text-[var(--text)] shadow-[4px_4px_0_var(--line)]"
    >
      <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--line)] ${iconBg}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-[var(--text)]">{toast.title}</div>
        {toast.detail && (
          <div className="mt-0.5 text-[11px] font-medium text-[var(--muted)] leading-relaxed">{toast.detail}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded-lg p-1 text-[var(--text)] transition hover:bg-[var(--line)]/10 cursor-pointer"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
