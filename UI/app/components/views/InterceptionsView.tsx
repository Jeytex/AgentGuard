import React, { useState, useMemo } from 'react';
import { ShieldAlert, Search, Filter, ChevronRight, Activity, X } from 'lucide-react';
import { AuditLogEntry } from '../../types';
import { Card } from '../common/Card';
import { Badge, RiskScoreBadge } from '../common/Badge';
import { EmptyState, LoadingSpinner } from '../common/StatusStates';

interface InterceptionsViewProps {
  interceptions: AuditLogEntry[];
  loading: boolean;
  onOpenItem: (item: AuditLogEntry) => void;
}

export function InterceptionsView({
  interceptions,
  loading,
  onOpenItem,
}: InterceptionsViewProps) {
  const [filterVerdict, setFilterVerdict] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return interceptions.filter((item) => {
      if (filterVerdict !== 'ALL' && item.verdict !== filterVerdict) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTool = item.tool_name.toLowerCase().includes(q);
        const matchAgent = item.agent_id.toLowerCase().includes(q);
        const matchReason = item.reason.toLowerCase().includes(q);
        if (!matchTool && !matchAgent && !matchReason) return false;
      }
      return true;
    });
  }, [interceptions, filterVerdict, searchQuery]);

  return (
    <Card>
      {/* View Header & Filter Bar */}
      <div className="flex flex-col gap-4 border-b-2 border-[var(--line)] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">Intercepted Agent Actions</h2>
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            Every intercepted tool execution, evaluated against Moss security policies
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-3.5 text-[var(--text)]" />
            <input
              type="text"
              placeholder="Search tool, agent, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] pl-9 pr-8 py-1.5 text-xs font-medium text-[var(--text)] outline-none shadow-[2px_2px_0_var(--line)] focus:ring-2 focus:ring-[var(--cyan)]/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[var(--text)] hover:opacity-75"
                title="Clear search"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Verdict filter tabs */}
          <div className="flex rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] p-0.5 text-xs shadow-[2px_2px_0_var(--line)]">
            {['ALL', 'ALLOW', 'BLOCK', 'REQUIRE_APPROVAL'].map((v) => (
              <button
                key={v}
                onClick={() => setFilterVerdict(v)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  filterVerdict === v
                    ? 'border-2 border-[var(--line)] bg-white text-[var(--text)] shadow-[2px_2px_0_var(--line)]'
                    : 'text-[var(--text)] hover:bg-white/50'
                }`}
              >
                {v === 'REQUIRE_APPROVAL' ? 'APPROVAL' : v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interceptions List */}
      {loading ? (
        <LoadingSpinner message="Fetching intercepted actions from database..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No intercepted actions found"
          description={
            searchQuery || filterVerdict !== 'ALL'
              ? 'Try adjusting your search query or verdict filters.'
              : 'No actions have been intercepted yet. Trigger actions from the Simulator.'
          }
          actionText={searchQuery || filterVerdict !== 'ALL' ? 'Reset Filters' : undefined}
          onAction={
            searchQuery || filterVerdict !== 'ALL'
              ? () => {
                  setSearchQuery('');
                  setFilterVerdict('ALL');
                }
              : undefined
          }
        />
      ) : (
        <div className="divide-y-2 divide-[var(--line)]">
          {filtered.map((item) => (
            <button
              key={item.action_id}
              onClick={() => onOpenItem(item)}
              className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-[var(--cyan)]/10 cursor-pointer"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
                <Activity className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text)] text-xs">{item.tool_name}</span>
                  <span className="font-mono text-[10px] font-bold text-[#134e56]">{item.agent_id}</span>
                </div>
                <div className="mt-1 truncate text-xs font-medium text-[var(--text)]">{item.reason}</div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <RiskScoreBadge score={item.risk_score} />
                <Badge kind={item.verdict}>{item.verdict}</Badge>
                {item.latency && (
                  <div className="hidden text-right font-mono text-[11px] sm:block">
                    <div className="text-[var(--text)] font-bold">
                      {item.latency.total_latency_ms.toFixed(1)} ms
                    </div>
                    <div className="text-[10px] font-bold text-[var(--muted)]">
                      Moss: {item.latency.moss_retrieval_ms.toFixed(1)}ms
                    </div>
                  </div>
                )}
                <ChevronRight className="size-4 text-[var(--text)]" />
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
