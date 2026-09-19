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

  const borderColor = isSuccess
    ? '#62d99a44'
    : isError
      ? '#ff6d7a44'
      : isWarning
        ? '#f59e0b44'
        : '#56d8e444';
  const bgColor = isSuccess
    ? '#0d1d16'
    : isError
      ? '#230f12'
      : isWarning
        ? '#231b0f'
        : '#0e1a1f';
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;
  const iconColor = isSuccess
    ? '#62d99a'
    : isError
      ? '#ff6d7a'
      : isWarning
        ? '#f59e0b'
        : '#56d8e4';

  return (
    <div
      style={{ borderColor, backgroundColor: bgColor }}
      className="flex min-w-[300px] max-w-md items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur"
    >
      <Icon style={{ color: iconColor }} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white">{toast.title}</div>
        {toast.detail && (
          <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{toast.detail}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="rounded p-1 text-[var(--muted)] hover:bg-white/5 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
