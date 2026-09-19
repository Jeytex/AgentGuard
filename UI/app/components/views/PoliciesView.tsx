import React, { useState, useMemo } from 'react';
import { BookOpen, Plus, RefreshCw, Search, Shield, Loader2, X } from 'lucide-react';
import { Policy } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { EmptyState, LoadingSpinner } from '../common/StatusStates';

interface PoliciesViewProps {
  policies: Policy[];
  loading: boolean;
  onOpenCreate: () => void;
  onSeedPolicies: () => Promise<void>;
  seeding: boolean;
}

export function PoliciesView({
  policies,
  loading,
  onOpenCreate,
  onSeedPolicies,
  seeding,
}: PoliciesViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEnforcement, setSelectedEnforcement] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filtered = useMemo(() => {
    return policies.filter((p) => {
      if (selectedCategory !== 'all' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (selectedEnforcement !== 'all' && p.enforcement !== selectedEnforcement) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchRule = p.rule_text.toLowerCase().includes(q);
        const matchId = p.id.toLowerCase().includes(q);
        const matchTools = p.target_tools?.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchRule && !matchId && !matchTools) return false;
      }
      return true;
    });
  }, [policies, selectedCategory, selectedEnforcement, searchQuery]);

  return (
    <Card>
      {/* Header with Title & Action Buttons */}
      <div className="flex flex-col gap-4 border-b-2 border-[var(--line)] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">Moss Security Policy Library</h2>
            <span className="rounded-full border border-[var(--line)] bg-[var(--cyan)]/25 px-2.5 py-0.5 text-xs font-bold text-[#134e56]">
              {policies.length} loaded
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            Declarative safety rules retrieved in &lt;5ms by Moss during agent action evaluation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            disabled={seeding}
            onClick={onSeedPolicies}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
            title="Re-index pre-configured policies into Moss runtime"
          >
            <RefreshCw className={`size-3.5 ${seeding ? 'animate-spin text-[#134e56]' : ''}`} />
            {seeding ? 'Indexing...' : 'Seed Policies'}
          </button>

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-3.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 cursor-pointer"
          >
            <Plus className="size-3.5" /> Add Policy
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border-b-2 border-[var(--line)] bg-[var(--panel2)]/30 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {['all', 'financial', 'destructive', 'pii', 'rbac', 'compliance'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl px-3 py-1 text-xs font-bold capitalize transition cursor-pointer ${
                selectedCategory === cat
                  ? 'border-2 border-[var(--line)] bg-[var(--cyan)] text-[var(--text)] shadow-[2px_2px_0_var(--line)]'
                  : 'border-2 border-transparent text-[var(--text)] hover:bg-[var(--cyan)]/25'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-3.5 text-[var(--text)]" />
            <input
              type="text"
              placeholder="Search rule or target tools..."
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

          <div className="flex rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] p-0.5 text-xs shadow-[2px_2px_0_var(--line)]">
            {['all', 'BLOCK', 'REQUIRE_APPROVAL', 'ALLOW'].map((enf) => (
              <button
                key={enf}
                onClick={() => setSelectedEnforcement(enf)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  selectedEnforcement === enf
                    ? 'border-2 border-[var(--line)] bg-white text-[var(--text)] shadow-[2px_2px_0_var(--line)]'
                    : 'text-[var(--text)] hover:bg-white/50'
                }`}
              >
                {enf === 'all' ? 'All Verdicts' : enf === 'REQUIRE_APPROVAL' ? 'APPROVAL' : enf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Policy List */}
      {loading ? (
        <LoadingSpinner message="Loading policies from Moss runtime..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No matching policies found"
          description={
            searchQuery || selectedCategory !== 'all' || selectedEnforcement !== 'all'
              ? 'Try resetting your active category, verdict filters, or search term.'
              : 'No policies configured. Add a new policy to index it into Moss.'
          }
          actionText={
            searchQuery || selectedCategory !== 'all' || selectedEnforcement !== 'all'
              ? 'Reset Filters'
              : 'Add Policy'
          }
          onAction={
            searchQuery || selectedCategory !== 'all' || selectedEnforcement !== 'all'
              ? () => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedEnforcement('all');
                }
              : onOpenCreate
          }
        />
      ) : (
        <div className="divide-y-2 divide-[var(--line)]">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 p-5 transition hover:bg-[var(--cyan)]/10 md:flex-row md:items-center"
            >
              <div className="w-28 font-mono text-xs font-bold text-[#134e56]">
                {p.id}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text)] text-xs">{p.name}</span>
                  <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text)] uppercase">
                    {p.category}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-[var(--text)] font-medium">{p.rule_text}</div>
                {p.target_tools && p.target_tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.target_tools.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded border border-[var(--line)] bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--text)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Badge kind={p.enforcement}>{p.enforcement}</Badge>
                <Badge kind={p.risk_level}>{p.risk_level}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
