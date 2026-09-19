import React, { useState, useMemo } from 'react';
import { FileKey2, Search, ChevronRight, Download, Filter, X } from 'lucide-react';
import { AuditLogEntry } from '../../types';
import { Card } from '../common/Card';
import { Badge, RiskScoreBadge } from '../common/Badge';
import { EmptyState, LoadingSpinner } from '../common/StatusStates';

interface AuditViewProps {
  interceptions: AuditLogEntry[];
  loading: boolean;
  onOpenItem: (item: AuditLogEntry) => void;
}

export function AuditView({ interceptions, loading, onOpenItem }: AuditViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState('all');

  const filtered = useMemo(() => {
    return interceptions.filter((item) => {
      if (selectedVerdict !== 'all' && item.verdict !== selectedVerdict) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTool = item.tool_name.toLowerCase().includes(q);
        const matchAgent = item.agent_id.toLowerCase().includes(q);
        const matchAction = item.action_id.toLowerCase().includes(q);
        if (!matchTool && !matchAgent && !matchAction) return false;
      }
      return true;
    });
  }, [interceptions, selectedVerdict, searchQuery]);

  const exportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `agentguard-audit-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <Card>
      {/* Header */}
      <div className="flex flex-col gap-4 border-b-2 border-[var(--line)] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">Immutable Security Audit Trail</h2>
            <span className="rounded-full border border-[var(--line)] bg-[var(--cyan)]/25 px-2.5 py-0.5 text-xs font-bold text-[#134e56]">
              {interceptions.length} recorded
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            Chronological log of agent actions, fast-path decisions, and human supervisor interventions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-3.5 text-[var(--text)]" />
            <input
              type="text"
              placeholder="Filter audit entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-52 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] pl-9 pr-8 py-1.5 text-xs font-medium text-[var(--text)] outline-none shadow-[2px_2px_0_var(--line)] focus:ring-2 focus:ring-[var(--cyan)]/40"
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

          <div className="flex rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] p-0.5 text-xs shadow-[2px_2px_0_var(--line)]">
            {['all', 'ALLOW', 'BLOCK', 'REQUIRE_APPROVAL'].map((v) => (
              <button
                key={v}
                onClick={() => setSelectedVerdict(v)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  selectedVerdict === v ? 'border-2 border-[var(--line)] bg-white text-[var(--text)] shadow-[2px_2px_0_var(--line)]' : 'text-[var(--text)] hover:bg-white/50'
                }`}
              >
                {v === 'REQUIRE_APPROVAL' ? 'APPROVAL' : v}
              </button>
            ))}
          </div>

          <button
            onClick={exportJson}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            <Download className="size-3.5" /> Export JSON
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <LoadingSpinner message="Loading audit trail from SQLite WAL log..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileKey2}
          title="No audit records match your filter"
          description="Try clearing search keywords or run security evaluations in the Simulator."
          actionText={searchQuery || selectedVerdict !== 'all' ? 'Reset Filters' : undefined}
          onAction={
            searchQuery || selectedVerdict !== 'all'
              ? () => {
                  setSearchQuery('');
                  setSelectedVerdict('all');
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--line)] bg-[var(--panel2)]/40 text-[10px] uppercase font-bold tracking-wider text-[var(--text)]">
                <th className="px-5 py-3 font-bold">Timestamp</th>
                <th className="px-5 py-3 font-bold">Action ID</th>
                <th className="px-5 py-3 font-bold">Agent / Role</th>
                <th className="px-5 py-3 font-bold">Tool Execution</th>
                <th className="px-5 py-3 font-bold">Verdict</th>
                <th className="px-5 py-3 font-bold">Latency</th>
                <th className="px-5 py-3 font-bold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[var(--line)]">
              {filtered.map((item) => {
                const date = new Date(item.timestamp);
                const timeStr = isNaN(date.getTime())
                  ? item.timestamp
                  : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

                return (
                  <tr
                    key={item.action_id}
                    onClick={() => onOpenItem(item)}
                    className="cursor-pointer transition hover:bg-[var(--cyan)]/10"
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px] font-medium text-[var(--muted)]">
                      {timeStr}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px] font-bold text-[#134e56]">
                      {item.action_id.slice(0, 16)}...
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[var(--text)]">{item.agent_id}</div>
                      <div className="text-[10px] font-medium text-[var(--muted)]">{item.agent_role}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-xs font-bold text-[var(--text)]">{item.tool_name}</div>
                      <div className="truncate max-w-xs text-[11px] font-medium text-[var(--muted)]">
                        {item.reason}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Badge kind={item.verdict}>{item.verdict}</Badge>
                        <RiskScoreBadge score={item.risk_score} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px]">
                      <div className="text-[var(--text)] font-bold">
                        {item.latency?.total_latency_ms.toFixed(1)} ms
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)]">
                        Moss: {item.latency?.moss_retrieval_ms.toFixed(1)}ms
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <ChevronRight className="inline-block size-4 text-[var(--text)]" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
