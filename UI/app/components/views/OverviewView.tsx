import React, { useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  Gauge,
  Database,
  Wifi,
  ChevronRight,
  Terminal,
  ArrowUpRight,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { AuditLogEntry, BenchmarkResult, SystemHealth } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';

interface OverviewViewProps {
  health: SystemHealth | null;
  interceptions: AuditLogEntry[];
  pendingCount: number;
  benchmarkResult: BenchmarkResult | null;
  onOpenItem: (item: any) => void;
  onNavigate: (view: any) => void;
}

export function OverviewView({
  health,
  interceptions,
  pendingCount,
  benchmarkResult,
  onOpenItem,
  onNavigate,
}: OverviewViewProps) {
  const metrics = useMemo(() => {
    const total = interceptions.length;
    const allows = interceptions.filter((x) => x.verdict === 'ALLOW').length;
    const blocks = interceptions.filter((x) => x.verdict === 'BLOCK').length;
    const approvals = interceptions.filter((x) => x.verdict === 'REQUIRE_APPROVAL').length;
    const allowRate = total > 0 ? Math.round((allows / total) * 100) : 100;

    let p95 = '—';
    if (benchmarkResult?.total_pipeline?.p95_ms) {
      p95 = `${benchmarkResult.total_pipeline.p95_ms.toFixed(1)} ms`;
    } else if (total > 0) {
      const latencies = interceptions.map((x) => x.latency?.total_latency_ms || 0).sort((a, b) => a - b);
      const idx = Math.floor(latencies.length * 0.95);
      p95 = `${latencies[idx]?.toFixed(1) || '3.5'} ms`;
    }

    return { total, allows, blocks, approvals, allowRate, p95 };
  }, [interceptions, benchmarkResult]);

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          onClick={() => onNavigate('Interceptions')}
          aria-label="View all interceptions and audit decisions"
          className="p-5 transition hover:border-[var(--cyan)]/40 hover:bg-white/[0.02]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--muted)]">Total Decisions</div>
              <div className="mt-2 text-2xl font-bold text-white">{metrics.total}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">Persisted audit events</div>
            </div>
            <div className="rounded-xl bg-[var(--cyan)]/10 p-2.5 text-[var(--cyan)]">
              <Activity className="size-5" />
            </div>
          </div>
        </Card>

        <Card
          onClick={() => onNavigate('Interceptions')}
          aria-label="View allow rate details in interceptions"
          className="p-5 transition hover:border-[var(--green)]/40 hover:bg-white/[0.02]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--muted)]">Allow Rate</div>
              <div className="mt-2 text-2xl font-bold text-[var(--green)]">
                {interceptions.length > 0 ? `${metrics.allowRate}%` : '100%'}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">Policy compliant actions</div>
            </div>
            <div className="rounded-xl bg-[var(--green)]/10 p-2.5 text-[var(--green)]">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
        </Card>

        <Card
          onClick={() => onNavigate('Benchmarks')}
          aria-label="View telemetry and P95 latency benchmarks"
          className="p-5 transition hover:border-purple-400/40 hover:bg-white/[0.02]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--muted)]">P95 Pipeline Latency</div>
              <div className="mt-2 text-2xl font-bold text-white">{metrics.p95}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                {benchmarkResult ? 'From live benchmark' : 'Target: sub-10ms'}
              </div>
            </div>
            <div className="rounded-xl bg-purple-400/10 p-2.5 text-purple-400">
              <Gauge className="size-5" />
            </div>
          </div>
        </Card>

        <Card
          onClick={() => onNavigate('Policies')}
          aria-label="View active security policies indexed in Moss"
          className="p-5 transition hover:border-[var(--cyan)]/40 hover:bg-white/[0.02]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--muted)]">Policies Indexed in Moss</div>
              <div className="mt-2 text-2xl font-bold text-[var(--cyan)]">
                {health?.total_policies_indexed ?? '—'}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                {health?.moss_connected
                  ? 'In-process active'
                  : health?.active_mode === 'degraded_local'
                  ? 'Local fallback active'
                  : health?.active_mode === 'moss_degraded'
                  ? 'Moss degraded (quota limit)'
                  : health?.active_mode === 'fallback_mock'
                  ? 'Local mock active'
                  : 'Checking connection...'}
              </div>
            </div>
            <div className="rounded-xl bg-[var(--cyan)]/10 p-2.5 text-[var(--cyan)]">
              <Database className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid: Activity Stream & Decision Distribution */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Live Decision Feed */}
        <Card>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Live Decision Activity</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Real-time stream from AgentGuard evaluation gateway
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--green)]">
              <span className="size-2 rounded-full bg-[var(--green)] animate-ping" />
              <Wifi className="size-3.5" /> Live
            </div>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {interceptions.slice(0, 6).map((item) => (
              <button
                key={item.action_id}
                onClick={() => onOpenItem(item)}
                className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-white/[0.02]"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[var(--cyan)]">
                  <Activity className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-white">
                    {item.tool_name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                    {item.agent_id} • {item.reason}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge kind={item.verdict}>{item.verdict}</Badge>
                  <span className="hidden font-mono text-[11px] text-[var(--cyan)] sm:inline">
                    {item.latency?.total_latency_ms ? `${item.latency.total_latency_ms.toFixed(1)}ms` : ''}
                  </span>
                  <ChevronRight className="size-4 text-[var(--muted)]" />
                </div>
              </button>
            ))}

            {interceptions.length === 0 && (
              <div className="p-8 text-center text-xs text-[var(--muted)]">
                No decisions recorded yet. Run a scenario in the Simulator to see live events.
              </div>
            )}
          </div>
        </Card>

        {/* Decision Distribution & Pending Review Alert */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Decision Distribution</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">All evaluated actions breakdown</p>

            <div className="mt-5 space-y-4">
              {[
                ['ALLOW', metrics.allows, '#62d99a'],
                ['BLOCK', metrics.blocks, '#ff6d7a'],
                ['REQUIRE_APPROVAL', metrics.approvals, '#e7b96b'],
              ].map(([name, count, color]) => {
                const total = Math.max(1, metrics.total);
                const pct = Math.round(((count as number) / total) * 100);
                return (
                  <div key={name as string}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-[var(--muted)] font-medium">
                        {(name as string).replace('REQUIRE_APPROVAL', 'HUMAN APPROVAL')}
                      </span>
                      <span className="font-mono text-white font-semibold">
                        {count as number} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/5">
                      <div
                        style={{
                          width: `${Math.max(4, pct)}%`,
                          backgroundColor: color as string,
                        }}
                        className="h-full rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Pending Review Quick Card */}
          {pendingCount > 0 && (
            <Card className="border-[#e7b96b44] bg-[#e7b96b08] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#e7b96b]">
                    Human Attention Required
                  </div>
                  <div className="mt-1 text-base font-bold text-white">
                    {pendingCount} Pending Approval{pendingCount > 1 ? 's' : ''}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Critical or high-threshold actions paused awaiting supervisor review.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('Approvals')}
                  className="rounded-lg bg-[#e7b96b] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
                >
                  Review Now
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Benchmark Live Telemetry Promo Card */}
      <Card className="border-purple-400/20 bg-purple-400/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[var(--line)]/20 bg-[var(--purple)]/25 p-2.5 text-[var(--line)]">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Sub-10ms Empirical Latency Benchmark</div>
              <p className="mt-1 max-w-xl text-xs text-[var(--muted)]">
                {benchmarkResult
                  ? `Last run verified: ${benchmarkResult.speedup_factor.toFixed(1)}x speedup over cloud vector DBs (P95: ${benchmarkResult.total_pipeline.p95_ms.toFixed(2)}ms).`
                  : 'Run side-by-side empirical performance test comparing in-process Moss hybrid search vs remote vector DBs.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('Benchmarks')}
            className="flex items-center gap-1.5 self-start rounded-xl border-2 border-[var(--line)] bg-[var(--purple)] px-4 py-2 text-xs font-bold text-[var(--line)] shadow-[2px_2px_0_var(--line)] transition hover:-translate-y-0.5 hover:opacity-95 sm:self-center cursor-pointer"
          >
            {benchmarkResult ? 'View Full Telemetry' : 'Run Benchmark'} <ArrowUpRight className="size-4" />
          </button>
        </div>
      </Card>

      {/* Simulator Promo Card */}
      <Card className="border-[#56d8e433] bg-[#56d8e408] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[var(--line)]/20 bg-[var(--cyan)]/25 p-2.5 text-[var(--line)]">
              <Terminal className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Interactive Attack & Scenario Simulator</div>
              <p className="mt-1 max-w-xl text-xs text-[var(--muted)]">
                Test real-time defense against destructive SQL injections, excessive financial refunds, PII leaks, and privilege escalations in sub-10ms.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('Simulator')}
            className="flex items-center gap-1.5 self-start rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-4 py-2 text-xs font-bold text-[var(--line)] shadow-[2px_2px_0_var(--line)] transition hover:-translate-y-0.5 hover:opacity-95 sm:self-center cursor-pointer"
          >
            Launch Simulator <ArrowUpRight className="size-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}
