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
            <div className="flex items-center gap-2 text-[#134e56]">
              <Zap className="size-5 text-[#134e56]" />
              <h2 className="text-base font-bold text-[var(--text)]">
                Sub-10ms Latency Benchmark &amp; Telemetry
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-[var(--muted)]">
              Empirical verification measuring in-process <b>Moss</b> hybrid search, Python SDK retrieval,
              and total <b>AgentGuard</b> pipeline latency vs. traditional remote cloud vector databases.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
              <span>Iterations:</span>
              <select
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                disabled={running}
                className="bg-transparent font-mono font-bold text-[var(--text)] outline-none cursor-pointer"
              >
                <option value={20} className="bg-[#fffdfa] text-[var(--text)]">20 queries</option>
                <option value={50} className="bg-[#fffdfa] text-[var(--text)]">50 queries</option>
                <option value={100} className="bg-[#fffdfa] text-[var(--text)]">100 queries</option>
              </select>
            </div>

            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-5 py-2.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin text-[var(--text)]" />
                  Running {iterations} Queries...
                </>
              ) : (
                <>
                  <Play className="size-4 fill-[var(--text)] text-[var(--text)]" />
                  Run Live Benchmark
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real Live Speedup Banner */}
        {benchmarkResult && speedup ? (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)]/25 p-4 shadow-[2px_2px_0_var(--line)]">
            <div className="rounded-lg border-2 border-[var(--line)] bg-[var(--cyan)] px-3 py-1 text-xs font-bold text-[var(--text)] shadow-[1px_1px_0_var(--line)]">
              {speedup.toFixed(1)}x FASTER
            </div>
            <div className="text-xs font-bold text-[var(--text)]">
              AgentGuard with in-process Moss runs <b className="text-[#134e56]">{speedup.toFixed(1)}x</b> faster
              than remote cloud vector databases, eliminating network round-trip bottlenecks.
            </div>
            <div className="ml-auto font-mono text-[11px] font-bold text-[var(--muted)]">
              Real telemetry from {benchmarkResult.total_queries} iterations at{' '}
              {new Date(benchmarkResult.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ) : !running ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-[#134e56]" />
              <span>
                No live benchmark executed yet. Click <b>Run Live Benchmark</b> to evaluate live in-process latency.
              </span>
            </div>
            <span className="font-mono text-[11px] font-bold text-[#134e56]">Target: Sub-10ms Pipeline</span>
          </div>
        ) : null}
      </Card>

      {/* Moss Degraded Banner */}
      {mossDegraded && (
        <Card className="border-2 border-[var(--line)] bg-[var(--amber)]/25 p-5 shadow-[3px_3px_0_var(--line)]">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl border-2 border-[var(--line)] bg-[var(--amber)] p-2.5 text-[#6d4508] shadow-[1px_1px_0_var(--line)]">
              <AlertTriangle className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#6d4508]">
                Moss Quota Exhausted (HTTP 503 Service Unavailable)
              </h3>
              <p className="text-xs leading-relaxed font-medium text-[var(--text)]">
                {mossDegraded}
              </p>
              <div className="pt-1 flex items-center gap-2 text-[11px] font-bold text-[#6d4508]">
                <span className="font-mono bg-[#fffdfa] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--text)]">
                  MOSS_MOCK_FALLBACK=false
                </span>
                <span>• Live Moss cloud usage limit reached; silent mock fallback is prohibited.</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Latency Cards Grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. Native In-Process Moss */}
        <Card className="p-5 border-2 border-[var(--line)] bg-[#fffdfa] shadow-[3px_3px_0_var(--line)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#134e56]">
              <Cpu className="size-3.5" />
              <span>Native In-Process Moss</span>
            </div>
            <span className="rounded border border-[var(--line)] bg-[#8ed9d344] px-2 py-0.5 text-[10px] font-mono text-[#134e56] font-bold">
              C Core
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[var(--text)] font-mono">
            {nativeMoss ? `${nativeMoss.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">In-process index search time</div>

          <div className="mt-5 space-y-2 border-t-2 border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P50 (Median):</span>
              <span className="font-bold text-[var(--text)]">{nativeMoss ? `${nativeMoss.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-bold text-[#134e56]">{nativeMoss ? `${nativeMoss.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-bold text-[var(--text)]">{nativeMoss ? `${nativeMoss.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 2. Moss Retrieval */}
        <Card className="p-5 border-2 border-[var(--line)] bg-[#fffdfa] shadow-[3px_3px_0_var(--line)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#26541b]">
              <Layers className="size-3.5" />
              <span>Moss Retrieval</span>
            </div>
            <span className="rounded border border-[var(--line)] bg-[#b9dc7944] px-2 py-0.5 text-[10px] font-mono text-[#26541b] font-bold">
              SDK &amp; IPC
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[var(--text)] font-mono">
            {mossRetrieval ? `${mossRetrieval.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">Python SDK + embedding + deserialization</div>

          <div className="mt-5 space-y-2 border-t-2 border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P50 (Median):</span>
              <span className="font-bold text-[var(--text)]">{mossRetrieval ? `${mossRetrieval.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-bold text-[#26541b]">{mossRetrieval ? `${mossRetrieval.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-bold text-[var(--text)]">{mossRetrieval ? `${mossRetrieval.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 3. Total AgentGuard Pipeline */}
        <Card className="p-5 border-2 border-[var(--line)] bg-[#fffdfa] shadow-[3px_3px_0_var(--line)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#47306b]">
              <ShieldCheck className="size-3.5" />
              <span>Total Pipeline</span>
            </div>
            <span className="rounded border border-[var(--line)] bg-[#a38bc244] px-2 py-0.5 text-[10px] font-mono text-[#47306b] font-bold">
              End-to-End
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[var(--text)] font-mono">
            {totalPipeline ? `${totalPipeline.mean_ms.toFixed(2)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">Pre-triage + Moss + Rule engine + Verdict</div>

          <div className="mt-5 space-y-2 border-t-2 border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P50 (Median):</span>
              <span className="font-bold text-[var(--text)]">{totalPipeline ? `${totalPipeline.p50_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-bold text-[#47306b]">{totalPipeline ? `${totalPipeline.p95_ms.toFixed(2)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-bold text-[var(--text)]">{totalPipeline ? `${totalPipeline.p99_ms.toFixed(2)} ms` : '—'}</span>
            </div>
          </div>
        </Card>

        {/* 4. Remote Vector DB Baseline */}
        <Card className="p-5 border-2 border-[var(--line)] bg-[#fffdfa] shadow-[3px_3px_0_var(--line)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8a1936]">
              <Clock3 className="size-3.5" />
              <span>Remote Vector DB</span>
            </div>
            <span className="rounded border border-[var(--line)] bg-[#ee86ad44] px-2 py-0.5 text-[10px] font-mono text-[#8a1936] font-bold">
              Cloud Network
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[#8a1936] font-mono">
            {remoteDb ? `${remoteDb.mean_ms.toFixed(1)} ms` : '—'}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">Network TLS + Cloud search round-trip</div>

          <div className="mt-5 space-y-2 border-t-2 border-[var(--line)] pt-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P50 (Median):</span>
              <span className="font-bold text-[var(--text)]">{remoteDb ? `${remoteDb.p50_ms.toFixed(1)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P95 (95th %ile):</span>
              <span className="font-bold text-[#8a1936]">{remoteDb ? `${remoteDb.p95_ms.toFixed(1)} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[var(--muted)]">P99 (Tail):</span>
              <span className="font-bold text-[var(--text)]">{remoteDb ? `${remoteDb.p99_ms.toFixed(1)} ms` : '—'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Comprehensive Latency & Percentiles Matrix Table */}
      <Card className="overflow-hidden">
        <div className="border-b-2 border-[var(--line)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">
                Empirical Percentiles Matrix (P50, P95, P99, Mean)
              </h3>
              <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                Real-world latency distribution verified directly against the running AgentGuard instance
              </p>
            </div>
            {benchmarkResult && (
              <span className="rounded-full border border-[var(--line)] bg-[var(--cyan)]/25 px-2.5 py-1 text-xs font-mono font-bold text-[#134e56]">
                {benchmarkResult.total_queries} iterations sampled
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b-2 border-[var(--line)] bg-[var(--panel2)]/40 text-[11px] uppercase font-bold tracking-wider text-[var(--text)]">
              <tr>
                <th className="px-5 py-3 font-bold">Metric</th>
                <th className="px-5 py-3 font-bold text-[#134e56]">Native Moss</th>
                <th className="px-5 py-3 font-bold text-[#26541b]">Moss Retrieval (SDK)</th>
                <th className="px-5 py-3 font-bold text-[#47306b]">Total AgentGuard Pipeline</th>
                <th className="px-5 py-3 font-bold text-[#8a1936]">Remote Cloud Vector DB</th>
                <th className="px-5 py-3 font-bold text-right text-[var(--text)]">Speedup Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[var(--line)]">
              {/* P50 */}
              <tr className="transition hover:bg-[var(--cyan)]/10">
                <td className="px-5 py-3.5 font-sans font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-1.5 py-0.5 text-[10px] font-mono font-bold">P50</span>
                  <span>Median Latency</span>
                </td>
                <td className="px-5 py-3.5 text-[#134e56] font-bold">
                  {nativeMoss ? `${nativeMoss.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#26541b] font-bold">
                  {mossRetrieval ? `${mossRetrieval.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#47306b] font-bold">
                  {totalPipeline ? `${totalPipeline.p50_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#8a1936] font-bold">
                  {remoteDb ? `${remoteDb.p50_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[#134e56]">
                  {remoteDb && totalPipeline && totalPipeline.p50_ms > 0
                    ? `${(remoteDb.p50_ms / totalPipeline.p50_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* P95 */}
              <tr className="transition hover:bg-[var(--cyan)]/10">
                <td className="px-5 py-3.5 font-sans font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="rounded border border-[var(--line)] bg-[var(--cyan)]/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#134e56]">P95</span>
                  <span>95th Percentile (SLA)</span>
                </td>
                <td className="px-5 py-3.5 text-[#134e56] font-bold">
                  {nativeMoss ? `${nativeMoss.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#26541b] font-bold">
                  {mossRetrieval ? `${mossRetrieval.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#47306b] font-bold">
                  {totalPipeline ? `${totalPipeline.p95_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#8a1936] font-bold">
                  {remoteDb ? `${remoteDb.p95_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[#134e56]">
                  {remoteDb && totalPipeline && totalPipeline.p95_ms > 0
                    ? `${(remoteDb.p95_ms / totalPipeline.p95_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* P99 */}
              <tr className="transition hover:bg-[var(--cyan)]/10">
                <td className="px-5 py-3.5 font-sans font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="rounded border border-[var(--line)] bg-[#a38bc244] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#47306b]">P99</span>
                  <span>99th Percentile (Worst-case)</span>
                </td>
                <td className="px-5 py-3.5 text-[#134e56] font-bold">
                  {nativeMoss ? `${nativeMoss.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#26541b] font-bold">
                  {mossRetrieval ? `${mossRetrieval.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#47306b] font-bold">
                  {totalPipeline ? `${totalPipeline.p99_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#8a1936] font-bold">
                  {remoteDb ? `${remoteDb.p99_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[#134e56]">
                  {remoteDb && totalPipeline && totalPipeline.p99_ms > 0
                    ? `${(remoteDb.p99_ms / totalPipeline.p99_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* Mean */}
              <tr className="transition hover:bg-[var(--cyan)]/10">
                <td className="px-5 py-3.5 font-sans font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text)]">AVG</span>
                  <span>Mean Latency</span>
                </td>
                <td className="px-5 py-3.5 text-[#134e56] font-bold">
                  {nativeMoss ? `${nativeMoss.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#26541b] font-bold">
                  {mossRetrieval ? `${mossRetrieval.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#47306b] font-bold">
                  {totalPipeline ? `${totalPipeline.mean_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-[#8a1936] font-bold">
                  {remoteDb ? `${remoteDb.mean_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[#134e56]">
                  {remoteDb && totalPipeline && totalPipeline.mean_ms > 0
                    ? `${(remoteDb.mean_ms / totalPipeline.mean_ms).toFixed(1)}x`
                    : '—'}
                </td>
              </tr>

              {/* Min / Max Range */}
              <tr className="transition hover:bg-[var(--cyan)]/10">
                <td className="px-5 py-3.5 font-sans font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text)]">RNG</span>
                  <span>Min – Max Range</span>
                </td>
                <td className="px-5 py-3.5 font-bold text-[var(--text)]">
                  {nativeMoss ? `${nativeMoss.min_ms.toFixed(2)} – ${nativeMoss.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 font-bold text-[var(--text)]">
                  {mossRetrieval ? `${mossRetrieval.min_ms.toFixed(2)} – ${mossRetrieval.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 font-bold text-[var(--text)]">
                  {totalPipeline ? `${totalPipeline.min_ms.toFixed(2)} – ${totalPipeline.max_ms.toFixed(2)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 font-bold text-[var(--text)]">
                  {remoteDb ? `${remoteDb.min_ms.toFixed(1)} – ${remoteDb.max_ms.toFixed(1)} ms` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-[#134e56]">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--text)]">Visual Latency Distribution (P50 vs. P95 vs. P99)</h3>
              <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                Comparing in-process Moss performance against cloud vector database latency overhead
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-[#134e56]">
                <span className="size-2.5 rounded-full bg-[#134e56]" /> Native Moss
              </span>
              <span className="flex items-center gap-1.5 text-[#26541b]">
                <span className="size-2.5 rounded-full bg-[#26541b]" /> Moss Retrieval
              </span>
              <span className="flex items-center gap-1.5 text-[#47306b]">
                <span className="size-2.5 rounded-full bg-[#47306b]" /> Total Pipeline
              </span>
              <span className="flex items-center gap-1.5 text-[#8a1936]">
                <span className="size-2.5 rounded-full bg-[#8a1936]" /> Remote Vector DB
              </span>
            </div>
          </div>

          {/* Comparative Bars */}
          <div className="mt-6 space-y-5 text-xs">
            {/* P50 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-[var(--text)] font-bold">P50 (Median Performance)</span>
                <div className="flex gap-4">
                  <span className="text-[#134e56] font-bold">Native: {nativeMoss?.p50_ms.toFixed(2)}ms</span>
                  <span className="text-[#47306b] font-bold">Pipeline: {totalPipeline.p50_ms.toFixed(2)}ms</span>
                  <span className="text-[#8a1936] font-bold">Remote DB: {remoteDb.p50_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full border border-[var(--line)] bg-black/10 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p50_ms / remoteDb.p50_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]"
                />
              </div>
            </div>

            {/* P95 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-[var(--text)] font-bold">P95 (95th Percentile SLA)</span>
                <div className="flex gap-4">
                  <span className="text-[#134e56] font-bold">Native: {nativeMoss?.p95_ms.toFixed(2)}ms</span>
                  <span className="text-[#47306b] font-bold">Pipeline: {totalPipeline.p95_ms.toFixed(2)}ms</span>
                  <span className="text-[#8a1936] font-bold">Remote DB: {remoteDb.p95_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full border border-[var(--line)] bg-black/10 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p95_ms / remoteDb.p95_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] via-[var(--green)] to-[var(--purple)]"
                />
              </div>
            </div>

            {/* P99 Comparison */}
            <div>
              <div className="mb-1.5 flex justify-between font-mono">
                <span className="text-[var(--text)] font-bold">P99 (Tail Latency Guarantee)</span>
                <div className="flex gap-4">
                  <span className="text-[#134e56] font-bold">Native: {nativeMoss?.p99_ms.toFixed(2)}ms</span>
                  <span className="text-[#47306b] font-bold">Pipeline: {totalPipeline.p99_ms.toFixed(2)}ms</span>
                  <span className="text-[#8a1936] font-bold">Remote DB: {remoteDb.p99_ms.toFixed(1)}ms</span>
                </div>
              </div>
              <div className="relative h-3.5 w-full rounded-full border border-[var(--line)] bg-black/10 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, (totalPipeline.p99_ms / remoteDb.p99_ms) * 100)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)]"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sub-10ms Pipeline Telemetry Architecture */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-[var(--text)]">AgentGuard Sub-10ms Execution Pipeline</h3>
        <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
          Every layer operates in-process with zero remote network serialization
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 shadow-[2px_2px_0_var(--line)]">
            <div className="flex items-center justify-between text-[#134e56] font-mono text-[11px] font-bold">
              <span>Stage 1</span>
              <span className="rounded border border-[var(--line)] bg-[#8ed9d344] px-1.5 py-0.5 text-[#134e56]">&lt; 0.5 ms</span>
            </div>
            <div className="mt-2 font-bold text-[var(--text)]">Regex Fast Pre-Triage</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-[var(--muted)]">
              Instant keyword and injection pattern detection executed before semantic lookup.
            </p>
          </div>

          <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 shadow-[2px_2px_0_var(--line)]">
            <div className="flex items-center justify-between text-[#26541b] font-mono text-[11px] font-bold">
              <span>Stage 2</span>
              <span className="rounded border border-[var(--line)] bg-[#b9dc7944] px-1.5 py-0.5 text-[#26541b]">&lt; 3.0 ms</span>
            </div>
            <div className="mt-2 font-bold text-[var(--text)]">Moss In-Process Search</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-[var(--muted)]">
              Embedded vector embedding and semantic index lookup directly in process RAM.
            </p>
          </div>

          <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 shadow-[2px_2px_0_var(--line)]">
            <div className="flex items-center justify-between text-[#47306b] font-mono text-[11px] font-bold">
              <span>Stage 3</span>
              <span className="rounded border border-[var(--line)] bg-[#a38bc244] px-1.5 py-0.5 text-[#47306b]">&lt; 1.0 ms</span>
            </div>
            <div className="mt-2 font-bold text-[var(--text)]">Deterministic Rule Engine</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-[var(--muted)]">
              Evaluates parameter condition schemas, roles, thresholds, and confidence bounds.
            </p>
          </div>

          <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-4 shadow-[2px_2px_0_var(--line)]">
            <div className="flex items-center justify-between text-[var(--text)] font-mono text-[11px] font-bold">
              <span>Stage 4</span>
              <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-1.5 py-0.5 text-[var(--text)]">&lt; 0.5 ms</span>
            </div>
            <div className="mt-2 font-bold text-[var(--text)]">Verdict &amp; Tool Gate</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-[var(--muted)]">
              Emits ALLOW, BLOCK, or REQUIRE_APPROVAL; triggers Tool Executor or enqueues review.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
