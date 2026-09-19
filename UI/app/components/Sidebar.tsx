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
      } absolute inset-y-16 z-20 w-64 border-r-2 border-[var(--line)] bg-[var(--purple)]/25 p-3 md:static md:block`}
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
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                isActive
                  ? 'bg-[var(--pink)] text-[var(--text)] shadow-[3px_3px_0_var(--line)] border-2 border-[var(--line)]'
                  : 'text-[var(--text)] hover:bg-[var(--cyan)]/60 hover:text-[var(--text)]'
              }`}
            >
              <Icon className="size-4 text-[var(--text)]" />
              <span className="truncate">{name}</span>
              {name === 'Approvals' && pendingCount > 0 && (
                <span className="ml-auto rounded-full border border-[var(--line)] bg-[var(--amber)] px-2 py-0.5 text-[10px] font-bold text-[#6d4508]">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 border-t-2 border-[var(--line)] pt-4">
        <div className="px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
          Moss Engine Status
        </div>
        <div className="mt-3 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-3 text-xs shadow-[2px_2px_0_var(--line)]">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${
                health?.moss_connected
                  ? 'bg-[#26541b]'
                  : health?.active_mode === 'moss_degraded'
                  ? 'bg-[#8a1936]'
                  : 'bg-[#6d4508]'
              }`}
            />
            <span className="font-bold text-[var(--text)]">
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
          <div className="mt-1.5 text-[11px] font-medium text-[var(--muted)]">
            Mode: <span className="font-mono font-bold text-[var(--text)]">{health?.active_mode || 'checking...'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-[var(--muted)]">
            <span>Policies Indexed:</span>
            <span className="font-mono font-bold text-[#134e56]">
              {health?.total_policies_indexed ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
