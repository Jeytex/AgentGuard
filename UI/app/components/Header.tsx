import React from 'react';
import { Shield, RefreshCw, Menu, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { WsConnectionStatus } from '../types';

interface HeaderProps {
  wsStatus: WsConnectionStatus;
  reconnectAttempt: number;
  nextRetrySeconds: number;
  onManualReconnect: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onOpenSimulator: () => void;
}

export function Header({
  wsStatus,
  reconnectAttempt,
  nextRetrySeconds,
  onManualReconnect,
  onRefresh,
  refreshing,
  mobileOpen,
  onToggleMobile,
  onOpenSimulator,
}: HeaderProps) {
  const isConnected = wsStatus === 'connected';
  const isReconnecting = wsStatus === 'reconnecting';
  const isConnecting = wsStatus === 'connecting';

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-[var(--line)] px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobile}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-white/5 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--cyan)] text-black shadow-lg shadow-[var(--cyan)]/10">
            <Shield className="size-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-white">
              Agent<span className="text-[var(--cyan)]">Guard</span>
            </div>
            <div className="hidden text-[10px] uppercase tracking-[.2em] text-[var(--muted)] sm:block">
              Sub-10ms Security & Reliability Layer
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Detailed WebSocket Connection Pill */}
          <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/[0.02] px-3 py-1 text-[var(--muted)]">
            {isConnected ? (
              <>
                <span className="size-2 rounded-full bg-[var(--green)] animate-pulse" />
                <span className="text-white font-medium flex items-center gap-1.5">
                  <Wifi className="size-3 text-[var(--green)]" />
                  <span className="hidden sm:inline">Live Stream Connected</span>
                  <span className="sm:hidden">Live</span>
                </span>
              </>
            ) : isReconnecting || isConnecting ? (
              <>
                <span className="size-2 rounded-full bg-[#e7b96b] animate-ping" />
                <span className="text-[#e7b96b] font-medium flex items-center gap-1.5">
                  <WifiOff className="size-3" />
                  {isConnecting
                    ? 'Connecting...'
                    : `Reconnecting in ${nextRetrySeconds}s (#${reconnectAttempt})`}
                </span>
                <button
                  onClick={onManualReconnect}
                  className="ml-1 text-[10px] underline hover:text-white"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-[#ff6d7a]" />
                <span className="text-[#ff6d7a] font-medium flex items-center gap-1.5">
                  <WifiOff className="size-3" />
                  Stream Offline (Polling)
                </span>
                <button
                  onClick={onManualReconnect}
                  className="ml-1 text-[10px] underline hover:text-white"
                >
                  Reconnect
                </button>
              </>
            )}
          </div>

          {/* Quick simulator trigger */}
          <button
            onClick={onOpenSimulator}
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--cyan)]/40 bg-[var(--cyan)]/10 px-3 py-1.5 text-xs font-medium text-[var(--cyan)] transition hover:bg-[var(--cyan)]/20 md:flex"
          >
            Simulator
          </button>

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            title="Refresh live data"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[var(--cyan)]' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {/* User avatar */}
          <div className="flex size-8 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel2)] text-xs font-bold text-white">
            AG
          </div>
        </div>
      </header>

      {/* Graceful Degraded State Banner */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b border-[#e7b96b33] bg-[#e7b96b0f] px-4 py-2 text-xs text-[#e7b96b]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              <b>Real-time WebSocket stream disconnected.</b> Graceful fallback polling is active to keep decision counts and pending approvals synchronized.
            </span>
          </div>
          <button
            onClick={onManualReconnect}
            className="ml-4 shrink-0 rounded border border-[#e7b96b66] bg-[#e7b96b22] px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:bg-[#e7b96b33]"
          >
            Reconnect Now
          </button>
        </div>
      )}
    </>
  );
}
