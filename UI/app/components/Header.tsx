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
      <header className="retro-window flex h-16 items-center justify-between border-b-2 border-[var(--line)] bg-[var(--panel)] px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobile}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--cyan)]/20 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex size-10 items-center justify-center rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] text-[var(--text)] shadow-[3px_3px_0_var(--line)]">
            <Shield className="size-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight text-[var(--text)]">
              Agent<span className="text-[#8a1936]">Guard</span>
            </div>
            <div className="hidden text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)] sm:block">
              Sub-10ms Security & Reliability Layer
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Detailed WebSocket Connection Pill */}
          <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-1 text-[var(--muted)] shadow-[2px_2px_0_var(--line)]">
            {isConnected ? (
              <>
                <span className="size-2 rounded-full bg-[#26541b] animate-pulse" />
                <span className="text-[var(--text)] font-bold flex items-center gap-1.5">
                  <Wifi className="size-3 text-[#26541b]" />
                  <span className="hidden sm:inline">Live Stream Connected</span>
                  <span className="sm:hidden">Live</span>
                </span>
              </>
            ) : isReconnecting || isConnecting ? (
              <>
                <span className="size-2 rounded-full bg-[#6d4508] animate-ping" />
                <span className="text-[#6d4508] font-bold flex items-center gap-1.5">
                  <WifiOff className="size-3" />
                  {isConnecting
                    ? 'Connecting...'
                    : `Reconnecting in ${nextRetrySeconds}s (#${reconnectAttempt})`}
                </span>
                <button
                  onClick={onManualReconnect}
                  className="ml-1 text-[10px] font-bold underline text-[var(--text)] hover:opacity-75"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-[#8a1936]" />
                <span className="text-[#8a1936] font-bold flex items-center gap-1.5">
                  <WifiOff className="size-3" />
                  Stream Offline (Polling)
                </span>
                <button
                  onClick={onManualReconnect}
                  className="ml-1 text-[10px] font-bold underline text-[var(--text)] hover:opacity-75"
                >
                  Reconnect
                </button>
              </>
            )}
          </div>

          {/* Quick simulator trigger */}
          <button
            onClick={onOpenSimulator}
            className="hidden items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--green)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 md:flex cursor-pointer"
          >
            Simulator
          </button>

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
            title="Refresh live data"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#134e56]' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {/* User avatar */}
          <div className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--panel2)] text-xs font-bold text-[var(--text)] shadow-[1px_1px_0_var(--line)]">
            AG
          </div>
        </div>
      </header>

      {/* Graceful Degraded State Banner */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b-2 border-[var(--line)] bg-[var(--amber)]/30 px-4 py-2 text-xs text-[#6d4508]">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0 text-[#6d4508]" />
            <span>
              <b className="font-bold text-[var(--text)]">Real-time WebSocket stream disconnected.</b> Graceful fallback polling is active to keep decision counts and pending approvals synchronized.
            </span>
          </div>
          <button
            onClick={onManualReconnect}
            className="ml-4 shrink-0 rounded-lg border-2 border-[var(--line)] bg-[var(--amber)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text)] shadow-[1px_1px_0_var(--line)] transition hover:opacity-90 cursor-pointer"
          >
            Reconnect Now
          </button>
        </div>
      )}
    </>
  );
}
