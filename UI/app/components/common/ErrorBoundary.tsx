'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AgentGuard ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[400px] w-full flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-950/10 p-8 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <AlertTriangle className="size-7" />
          </div>

          <h3 className="mt-4 text-lg font-bold text-white">
            {this.props.fallbackTitle || 'Component Rendering Error'}
          </h3>

          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
            An unexpected error occurred while rendering this interface. Your security gateway remains operational in the background.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--orange)] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[var(--orange)]/20 transition hover:opacity-95"
            >
              <RefreshCw className="size-3.5" /> Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
            >
              Reload View
            </button>
          </div>

          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <details className="mt-6 w-full max-w-lg text-left">
              <summary className="cursor-pointer text-xs font-medium text-red-400">
                Technical Stack Trace
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-4 font-mono text-[11px] text-red-300">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
