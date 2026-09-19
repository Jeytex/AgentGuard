import React from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  Inbox,
  BookOpen,
  Users,
  BarChart3,
  FileKey2,
  Terminal,
  ChevronRight,
  Database,
} from 'lucide-react';
import { SystemHealth } from '../types';

export type ViewType =
  | 'Overview'
  | 'Interceptions'
  | 'Approvals'
  | 'Policies'
  | 'Agents'
  | 'Benchmarks'
  | 'Simulator'
  | 'Audit / Incidents';

const NAV_ITEMS: [ViewType, React.ElementType][] = [
  ['Overview', LayoutDashboard],
  ['Interceptions', ShieldAlert],
  ['Approvals', Inbox],
  ['Policies', BookOpen],
  ['Agents', Users],
  ['Benchmarks', BarChart3],
  ['Simulator', Terminal],
  ['Audit / Incidents', FileKey2],
];

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  pendingCount: number;
  health: SystemHealth | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  currentView,
  onSelectView,
  pendingCount,
  health,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <aside
      className={`${
        mobileOpen ? 'block' : 'hidden'
      } absolute inset-y-16 z-20 w-64 border-r-2 border-[var(--line)] bg-[var(--panel)] p-3 md:static md:block`}
    >
      <div className="mb-4 px-3 pt-3 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
        Control Center
      </div>

      <nav className="space-y-1">
        {NAV_ITEMS.map(([name, Icon]) => {
          const isActive = currentView === name;
          return (
            <button
              key={name}
              onClick={() => {
                onSelectView(name);
                onCloseMobile();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-[var(--muted)] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`size-4 ${isActive ? 'text-[var(--cyan)]' : ''}`} />
              <span className="truncate">{name}</span>
              {name === 'Approvals' && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-[#e7b96b]/20 px-2 py-0.5 text-[10px] font-bold text-[#e7b96b]">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 border-t border-[var(--line)] pt-4">
        <div className="px-3 text-[10px] uppercase tracking-[.2em] text-[var(--muted)]">
          Moss Engine Status
        </div>
        <div className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs border border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                health?.moss_connected
                  ? 'bg-[var(--green)]'
                  : health?.active_mode === 'moss_degraded'
                  ? 'bg-[#ff6d7a]'
                  : 'bg-[#e7b96b]'
              }`}
            />
            <span className="font-semibold text-white">
              {health?.moss_connected
                ? 'Moss In-Process'
                : health?.active_mode === 'degraded_local'
                ? 'Local Fallback'
                : health?.active_mode === 'moss_degraded'
                ? 'Moss Degraded'
                : health?.active_mode === 'fallback_mock'
                ? 'Mock Engine'
                : 'Connecting Engine'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            Mode: <span className="font-mono text-white">{health?.active_mode || 'checking...'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>Policies Indexed:</span>
            <span className="font-mono text-[var(--cyan)] font-semibold">
              {health?.total_policies_indexed ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
