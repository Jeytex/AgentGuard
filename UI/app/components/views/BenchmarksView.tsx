import React, { useState } from 'react';
import {
  Clock3,
  Play,
  Zap,
  CheckCircle2,
  Loader2,
  Gauge,
  BarChart3,
  Layers,
  Activity,
  ShieldCheck,
  Cpu,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { BenchmarkResult } from '../../types';
import { Card } from '../common/Card';

interface BenchmarksViewProps {
  benchmarkResult: BenchmarkResult | null;
  onRunBenchmark: (iterations: number) => Promise<void>;
  running: boolean;
}

export function BenchmarksView({
  benchmarkResult,
  onRunBenchmark,
  running,
}: BenchmarksViewProps) {
  const [iterations, setIterations] = useState(50);
  const [mossDegraded, setMossDegraded] = useState<string | null>(null);

  const handleRun = async () => {
    setMossDegraded(null);
    try {
      await onRunBenchmark(iterations);
    } catch (err: any) {
      if (
        err?.code === 'MOSS_UNAVAILABLE' ||
        err?.reason === 'credit_exhausted' ||
        err?.message?.includes('503') ||
        err?.message?.includes('credit_exhausted') ||
        err?.message?.includes('MOSS_UNAVAILABLE')
      ) {
        setMossDegraded(
          'Moss Quota Exhausted: Live Moss retrieval engine is unavailable (HTTP 503 credit_exhausted). Side-by-side latency benchmark cannot run while live Moss is degraded and local fallback is disabled.'
        );
      }
    }
  };

  const nativeMoss = benchmarkResult?.native_moss;
  const mossRetrieval = benchmarkResult?.moss_retrieval;
  const totalPipeline = benchmarkResult?.total_pipeline;
  const remoteDb = benchmarkResult?.remote_vector_db;
  const speedup = benchmarkResult?.speedup_factor;

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[var(--cyan)]">
              <Zap className="size-5" />
              <h2 className="text-base font-semibold text-white">
                Sub-10ms Latency Benchmark &amp; Telemetry
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
              Empirical verification measuring in-process <b>Moss</b> hybrid search, Python SDK retrieval,
              and total <b>AgentGuard</b> pipeline latency vs. traditional remote cloud vector databases.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-black/40 px-3 py-1.5 text-xs text-[var(--muted)]">
              <span>Iterations:</span>
              <select
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                disabled={running}
                className="bg-transparent font-mono font-semibold text-white outline-none cursor-pointer"
              >
                <option value={20} className="bg-[#0e1115]">20 queries</option>
                <option value={50} className="bg-[#0e1115]">50 queries</option>
                <option value={100} className="bg-[#0e1115]">100 queries</option>
              </select>
            </div>

            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 rounded-xl bg-[var(--cyan)] px-5 py-2.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running {iterations} Queries...
                </>
              ) : (
                <>
                  <Play className="size-4 fill-black" />
                  Run Live Benchmark
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real Live Speedup Banner */}
        {benchmarkResult && speedup ? (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--cyan)]/30 bg-[var(--cyan)]/5 p-4">
            <div className="rounded-lg bg-[var(--cyan)] px-3 py-1 text-xs font-bold text-black">
              {speedup.toFixed(1)}x FASTER
            </div>
            <div className="text-xs text-white">
              AgentGuard with in-process Moss runs <b className="text-[var(--cyan)]">{speedup.toFixed(1)}x</b> faster
              than remote cloud vector databases, eliminating network round-trip bottlenecks.
            </div>
            <div className="ml-auto font-mono text-[11px] text-[var(--muted)]">
              Real telemetry from {benchmarkResult.total_queries} iterations at{' '}
              {new Date(benchmarkResult.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ) : !running ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white/[0.015] p-4 text-xs text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-[var(--cyan)]" />
              <span>
                No live benchmark executed yet. Click <b>Run Live Benchmark</b> to evaluate live in-process latency.
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--muted)]">Target: Sub-10ms Pipeline</span>
          </div>
        ) : null}
      </Card>

      {/* Moss Degraded Banner */}
      {mossDegraded && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-400">
              <AlertTriangle className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-300">
                Moss Quota Exhausted (HTTP 503 Service Unavailable)
              </h3>
              <p className="text-xs leading-relaxed text-amber-200/90">
                {mossDegraded}
              </p>
              <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-300/80">
                <span className="font-mono bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                  MOSS_MOCK_FALLBACK=false
                </span>
                <span>• Live Moss cloud usage limit reached; silent mock fallback is prohibited.</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Latency Comparison Metric Cards (4 Pillars) */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Native Moss */}
        <Card className="p-5 border-[var(--cyan)]/25 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)]">
              <Cpu className="size-3.5" />
              <span>Native Moss</span>
            </div>
            <span className="rounded bg-[var(--cyan)]/15 px-2 py-0.5 text-[10px] font-mono text-[var(--cyan)] font-bold">
              Pure C/Rust
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white font-mono">
            {nativeMoss ? `${nativeMoss.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">In-process index search time</div>

          <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P50 (Median):</span>
              <span className="font-semibold text-white">{nativeMoss ? `${nativeMoss.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-semibold text-[var(--cyan)]">{nativeMoss ? `${nativeMoss.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-semibold text-white">{nativeMoss ? `${nativeMoss.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 2. Moss Retrieval */}
        <Card className="p-5 border-[var(--green)]/25 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--green)]">
              <Layers className="size-3.5" />
              <span>Moss Retrieval</span>
            </div>
            <span className="rounded bg-[var(--green)]/15 px-2 py-0.5 text-[10px] font-mono text-[var(--green)] font-bold">
              SDK &amp; IPC
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white font-mono">
            {mossRetrieval ? `${mossRetrieval.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">Python SDK + embedding + deserialization</div>

          <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P50 (Median):</span>
              <span className="font-semibold text-white">{mossRetrieval ? `${mossRetrieval.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-semibold text-[var(--green)]">{mossRetrieval ? `${mossRetrieval.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-semibold text-white">{mossRetrieval ? `${mossRetrieval.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 3. Total AgentGuard Pipeline */}
        <Card className="p-5 border-purple-400/25 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400">
              <ShieldCheck className="size-3.5" />
              <span>Total Pipeline</span>
            </div>
            <span className="rounded bg-purple-400/15 px-2 py-0.5 text-[10px] font-mono text-purple-400 font-bold">
              End-to-End
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white font-mono">
            {totalPipeline ? `${totalPipeline.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">Pre-triage + Moss + Rule engine + Verdict</div>

          <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P50 (Median):</span>
              <span className="font-semibold text-white">{totalPipeline ? `${totalPipeline.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-semibold text-purple-300">{totalPipeline ? `${totalPipeline.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-semibold text-white">{totalPipeline ? `${totalPipeline.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 4. Remote Vector DB Baseline */}
        <Card className="p-5 border-[#ff6d7a]/25 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ff6d7a]">
              <Clock3 className="size-3.5" />
              <span>Remote Vector DB</span>
            </div>
            <span className="rounded bg-[#ff6d7a]/15 px-2 py-0.5 text-[10px] font-mono text-[#ff6d7a] font-bold">
              Cloud Network
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[#ff6d7a] font-mono">
            {remoteDb ? `${remoteDb.mean_ms.toFixed(1)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">Network TLS + Cloud search round-trip</div>

          <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P50 (Median):</span>
              <span className="font-semibold text-white">{remoteDb ? `${remoteDb.p50_ms.toFixed(1)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-semibold text-[#ff6d7a]">{remoteDb ? `${remoteDb.p95_ms.toFixed(1)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-semibold text-white">{remoteDb ? `${remoteDb.p99_ms.toFixed(1)} ms` : '—'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Comprehensive Latency & Percentiles Matrix Table */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Empirical Percentiles Matrix (P50, P95, P99, Mean)
              </h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Real-world latency distribution verified directly against the running AgentGuard instance
              </p>
            </div>
            {benchmarkResult && (
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-mono text-[var(--cyan)]">
                {benchmarkResult.total_queries} iterations sampled
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-[var(--line)] bg-white/[0.02] text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Metric</th>
                <th className="px-5 py-3 font-semibold text-[var(--cyan)]">Native Moss</th>
                <th className="px-5 py-3 font-semibold text-[var(--green)]">Moss Retrieval (SDK)</th>
                <th className="px-5 py-3 font-semibold text-purple-400">Total AgentGuard Pipeline</th>
                <th className="px-5 py-3 font-semibold text-[#ff6d7a]">Remote Cloud Vector DB</th>
                <th className="px-5 py-3 font-semibold text-right text-white">Speedup Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {/* P50 */}
              <tr className="transition hover:bg-white/[0.015]">
                <td className="px-5 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">P50</span>
                  <span>Median Latency</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--cyan)] font-semibold">
                  {nativeMoss ? `${nativeMoss.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--green)] font-semibold">
                  {mossRetrieval ? `${mossRetrieval.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-purple-300 font-bold">
                  {totalPipeline ? `${totalPipeline.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#ff6d7a]">
                  {remoteDb ? `${remoteDb.p50_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[var(--cyan)]">
                  {remoteDb && totalPipeline && totalPipeline.p50_ms > 0
                    ? `${(remoteDb.p50_ms / totalPipeline.p50_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* P95 */}
              <tr className="transition hover:bg-white/[0.015]">
                <td className="px-5 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                  <span className="rounded bg-[var(--cyan)]/20 px-1.5 py-0.5 text-[10px] font-mono text-[var(--cyan)]">P95</span>
                  <span>95th Percentile (SLA)</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--cyan)] font-semibold">
                  {nativeMoss ? `${nativeMoss.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--green)] font-semibold">
                  {mossRetrieval ? `${mossRetrieval.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-purple-300 font-bold">
                  {totalPipeline ? `${totalPipeline.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#ff6d7a]">
                  {remoteDb ? `${remoteDb.p95_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[var(--cyan)]">
                  {remoteDb && totalPipeline && totalPipeline.p95_ms > 0
                    ? `${(remoteDb.p95_ms / totalPipeline.p95_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* P99 */}
              <tr className="transition hover:bg-white/[0.015]">
                <td className="px-5 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                  <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-mono text-purple-400">P99</span>
                  <span>99th Percentile (Worst-case)</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--cyan)] font-semibold">
                  {nativeMoss ? `${nativeMoss.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--green)] font-semibold">
                  {mossRetrieval ? `${mossRetrieval.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-purple-300 font-bold">
                  {totalPipeline ? `${totalPipeline.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#ff6d7a]">
                  {remoteDb ? `${remoteDb.p99_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[var(--cyan)]">
                  {remoteDb && totalPipeline && totalPipeline.p99_ms > 0
                    ? `${(remoteDb.p99_ms / totalPipeline.p99_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* Mean */}
              <tr className="transition hover:bg-white/[0.015]">
                <td className="px-5 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">AVG</span>
                  <span>Mean Latency</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--cyan)]">
                  {nativeMoss ? `${nativeMoss.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--green)]">
                  {mossRetrieval ? `${mossRetrieval.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-purple-300 font-semibold">
                  {totalPipeline ? `${totalPipeline.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#ff6d7a]">
                  {remoteDb ? `${remoteDb.mean_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[var(--cyan)]">
                  {remoteDb && totalPipeline && totalPipeline.mean_ms > 0
                    ? `${(remoteDb.mean_ms / totalPipeline.mean_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* Min / Max Range */}
              <tr className="transition hover:bg-white/[0.015]">
                <td className="px-5 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">RNG</span>
                  <span>Min – Max Range</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">
                  {nativeMoss ? `${nativeMoss.min_ms.toFixed(2)} – ${nativeMoss.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">
                  {mossRetrieval ? `${mossRetrieval.min_ms.toFixed(2)} – ${mossRetrieval.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">
                  {totalPipeline ? `${totalPipeline.min_ms.toFixed(2)} – ${totalPipeline.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">
                  {remoteDb ? `${remoteDb.min_ms.toFixed(1)} – ${remoteDb.max_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right text-[var(--muted)]">
                  {speedup ? `${speedup.toFixed(1)}x` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Visual Latency Penalty & Percentile Comparison Bars */}
      {totalPipeline && remoteDb && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Visual Latency Distribution (P50 vs. P95 vs. P99)</h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Comparing in-process Moss performance against cloud vector database latency overhead
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--cyan)]" /> Native Moss
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--green)]" /> Moss Retrieval
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-purple-400" /> Total Pipeline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff6d7a]" /> Remote Vector DB
              </span>
            </div>
          </div>

          {/* Comparative Bars */}
          <div className="mt-6 space-y-5 text-xs">
            {/* P50 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-white font-medium">P50 (Median Performance)</span>
                <div className="flex gap-4">
                  <span className="text-[var(--cyan)]">Native: {nativeMoss?.p50_ms.toFixed(2)}ms</span>
                  <span className="text-purple-300">Pipeline: {totalPipeline.p50_ms.toFixed(2)}ms</span>
                  <span className="text-[#ff6d7a]">Remote DB: {remoteDb.p50_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p50_ms / remoteDb.p50_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-purple-400"
                />
              </div>
            </div>

            {/* P95 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-white font-medium">P95 (95th Percentile SLA)</span>
                <div className="flex gap-4">
                  <span className="text-[var(--cyan)]">Native: {nativeMoss?.p95_ms.toFixed(2)}ms</span>
                  <span className="text-purple-300 font-bold">Pipeline: {totalPipeline.p95_ms.toFixed(2)}ms</span>
                  <span className="text-[#ff6d7a]">Remote DB: {remoteDb.p95_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p95_ms / remoteDb.p95_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] via-[var(--green)] to-purple-400"
                />
              </div>
            </div>

            {/* P99 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-white font-medium">P99 (Tail Latency Guarantee)</span>
                <div className="flex gap-4">
                  <span className="text-[var(--cyan)]">Native: {nativeMoss?.p99_ms.toFixed(2)}ms</span>
                  <span className="text-purple-300">Pipeline: {totalPipeline.p99_ms.toFixed(2)}ms</span>
                  <span className="text-[#ff6d7a]">Remote DB: {remoteDb.p99_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p99_ms / remoteDb.p99_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-purple-500"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sub-10ms Pipeline Telemetry Architecture */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">AgentGuard Sub-10ms Execution Pipeline</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Every layer operates in-process with zero remote network serialization
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-xl border border-[var(--line)] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between text-[var(--cyan)] font-mono text-[11px]">
              <span>Stage 1</span>
              <span className="rounded bg-[var(--cyan)]/15 px-1.5 py-0.5">&lt; 0.5 ms</span>
            </div>
            <div className="mt-2 font-semibold text-white">Regex Fast Pre-Triage</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Instant keyword and injection pattern detection executed before semantic lookup.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between text-[var(--green)] font-mono text-[11px]">
              <span>Stage 2</span>
              <span className="rounded bg-[var(--green)]/15 px-1.5 py-0.5">&lt; 3.0 ms</span>
            </div>
            <div className="mt-2 font-semibold text-white">Moss In-Process Search</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Embedded vector embedding and semantic index lookup directly in process RAM.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between text-purple-400 font-mono text-[11px]">
              <span>Stage 3</span>
              <span className="rounded bg-purple-400/15 px-1.5 py-0.5">&lt; 1.0 ms</span>
            </div>
            <div className="mt-2 font-semibold text-white">Deterministic Rule Engine</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Evaluates parameter condition schemas, roles, thresholds, and confidence bounds.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between text-white font-mono text-[11px]">
              <span>Stage 4</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5">&lt; 0.5 ms</span>
            </div>
            <div className="mt-2 font-semibold text-white">Verdict &amp; Tool Gate</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Emits ALLOW, BLOCK, or REQUIRE_APPROVAL; triggers Tool Executor or enqueues review.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
