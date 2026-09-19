import React, { useState } from 'react';
import {
  Terminal,
  Play,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Cpu,
  Loader2,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { ActionEvaluationResponse, SimulationScenario } from '../../types';
import { Card } from '../common/Card';
import { Badge, RiskScoreBadge } from '../common/Badge';
import { LoadingSpinner } from '../common/StatusStates';

interface SimulatorViewProps {
  scenarios: SimulationScenario[];
  loading: boolean;
  onRunScenario: (scenarioId: string) => Promise<ActionEvaluationResponse>;
  onCustomEvaluate: (request: any) => Promise<ActionEvaluationResponse>;
  onNavigate?: (view: any) => void;
}

export function SimulatorView({
  scenarios,
  loading,
  onRunScenario,
  onCustomEvaluate,
  onNavigate,
}: SimulatorViewProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<ActionEvaluationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  // Custom evaluation form state
  const [agentId, setAgentId] = useState('custom-agent-01');
  const [agentRole, setAgentRole] = useState('tier_1_support');
  const [toolName, setToolName] = useState('stripe_issue_refund');
  const [parametersJson, setParametersJson] = useState('{\n  "amount": 2500,\n  "customer_id": "cust_9981"\n}');
  const [contextText, setContextText] = useState('Customer requested emergency refund due to service disruption.');
  const [customRunning, setCustomRunning] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [mossDegraded, setMossDegraded] = useState<string | null>(null);

  const handleRunPreset = async (scenarioId: string) => {
    setRunningId(scenarioId);
    setMossDegraded(null);
    try {
      const res = await onRunScenario(scenarioId);
      setLatestResult(res);
    } catch (err: any) {
      if (
        err?.code === 'MOSS_UNAVAILABLE' ||
        err?.reason === 'credit_exhausted' ||
        err?.message?.includes('503') ||
        err?.message?.includes('credit_exhausted') ||
        err?.message?.includes('MOSS_UNAVAILABLE')
      ) {
        setMossDegraded(
          'Moss Quota Exhausted: Live Moss in-process retrieval engine is temporarily unavailable (HTTP 503 credit_exhausted). Local fallback is disabled (MOSS_MOCK_FALLBACK=false).'
        );
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleRunCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    setMossDegraded(null);
    let parsedParams = {};
    try {
      parsedParams = JSON.parse(parametersJson);
    } catch {
      setCustomError('Parameters must be valid JSON');
      return;
    }

    setCustomRunning(true);
    try {
      const res = await onCustomEvaluate({
        agent_id: agentId,
        agent_role: agentRole,
        tool_name: toolName,
        parameters: parsedParams,
        context: contextText,
        dry_run: false,
      });
      setLatestResult(res);
    } catch (err: any) {
      if (
        err?.code === 'MOSS_UNAVAILABLE' ||
        err?.reason === 'credit_exhausted' ||
        err?.message?.includes('503') ||
        err?.message?.includes('credit_exhausted') ||
        err?.message?.includes('MOSS_UNAVAILABLE')
      ) {
        setMossDegraded(
          'Moss Quota Exhausted: Live Moss in-process retrieval engine is temporarily unavailable (HTTP 503 credit_exhausted). Local fallback is disabled (MOSS_MOCK_FALLBACK=false).'
        );
      } else {
        setCustomError(err?.message || 'Evaluation failed');
      }
    } finally {
      setCustomRunning(false);
    }
  };

  const OFFICIAL_DEMOS = ['benign_calendar', 'sql_drop_table', 'excessive_refund'];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
              <Terminal className="size-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">
                Live Attack &amp; Guardrail Simulator
              </h2>
              <p className="mt-1 max-w-xl text-xs font-medium text-[var(--muted)] leading-relaxed">
                Trigger preset attacks, privilege escalations, and benign workflows against your live
                FastAPI security engine. Watch Moss intercept and enforce policies in sub-10ms.
              </p>
            </div>
          </div>

          <div className="flex rounded-xl border-2 border-[var(--line)] bg-[var(--panel2)] p-0.5 text-xs shadow-[2px_2px_0_var(--line)]">
            <button
              onClick={() => setActiveTab('presets')}
              className={`rounded-lg px-3 py-1.5 font-bold transition cursor-pointer ${
                activeTab === 'presets'
                  ? 'border-2 border-[var(--line)] bg-white text-[var(--text)] shadow-[2px_2px_0_var(--line)]'
                  : 'text-[var(--text)] hover:bg-white/50'
              }`}
            >
              Preset Scenarios ({scenarios.length})
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`rounded-lg px-3 py-1.5 font-bold transition cursor-pointer ${
                activeTab === 'custom'
                  ? 'border-2 border-[var(--line)] bg-white text-[var(--text)] shadow-[2px_2px_0_var(--line)]'
                  : 'text-[var(--text)] hover:bg-white/50'
              }`}
            >
              Custom Action Tester
            </button>
          </div>
        </div>
      </Card>

      {/* Moss Degraded / Credit Exhausted Banner */}
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

      {/* Latest Evaluation Result Banner */}
      {latestResult && (
        <Card className="border-2 border-[var(--line)] bg-[var(--panel2)]/30 p-5 shadow-[3px_3px_0_var(--line)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b-2 border-[var(--line)] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] text-[var(--text)] shadow-[2px_2px_0_var(--line)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Latest Evaluation Output
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-semibold text-white text-sm">
                    {latestResult.tool_name || 'Evaluated Action'}
                  </span>
                  <Badge kind={latestResult.verdict}>{latestResult.verdict}</Badge>
                  <RiskScoreBadge score={latestResult.risk_score} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-1.5 shadow-[2px_2px_0_var(--line)]">
                <span className="font-bold text-[var(--muted)]">Moss Retrieval: </span>
                <span className="font-bold text-[#134e56]">
                  {latestResult.latency?.moss_retrieval_ms?.toFixed(2) ?? '0.00'} ms
                </span>
              </div>
              <div className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-1.5 shadow-[2px_2px_0_var(--line)]">
                <span className="font-bold text-[var(--muted)]">Total Pipeline: </span>
                <span className="font-bold text-[#26541b]">
                  {latestResult.latency?.total_latency_ms?.toFixed(2) ?? '0.00'} ms
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 text-xs lg:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">
                Security Rationale
              </div>
              <p className="mt-1 font-medium text-[var(--text)] leading-relaxed">{latestResult.reason}</p>

              {latestResult.matched_policies?.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">
                    Matched Violation Policies ({latestResult.matched_policies.length})
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {latestResult.matched_policies.map((p, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-3 text-[11px] shadow-[2px_2px_0_var(--line)]"
                      >
                        <div className="flex justify-between font-mono font-bold text-[#134e56]">
                          <span>{p.policy_id}</span>
                          <span>Score: {Math.round(p.score * 100)}%</span>
                        </div>
                        <div className="mt-1 font-semibold text-[var(--text)]">{p.rule_text}</div>
                        {p.reason && (
                          <div className="mt-1 text-[10px] font-medium text-[#8a1936]">
                            Violation: {p.reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">
                Tool Execution Status
              </div>
              <div className="mt-1 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-3 font-mono text-[11px] shadow-[2px_2px_0_var(--line)]">
                {latestResult.execution_result ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {latestResult.execution_result.status === 'success' ? (
                          <ShieldCheck className="size-4 text-[#26541b]" />
                        ) : latestResult.execution_result.status === 'blocked' ? (
                          <ShieldX className="size-4 text-[#8a1936]" />
                        ) : (
                          <AlertTriangle className="size-4 text-[#6d4508]" />
                        )}
                        <span className="font-semibold text-[var(--text)]">
                          Status:{' '}
                          <span
                            className={`uppercase font-bold ${
                              latestResult.execution_result.status === 'success'
                                ? 'text-[#26541b]'
                                : latestResult.execution_result.status === 'blocked'
                                ? 'text-[#8a1936]'
                                : 'text-[#6d4508]'
                            }`}
                          >
                            {latestResult.execution_result.status}
                          </span>
                        </span>
                      </div>
                      <span className="font-bold text-[var(--text)]">
                        {latestResult.execution_result.execution_time_ms.toFixed(2)} ms
                      </span>
                    </div>

                    <pre className="scrollbar mt-2 max-h-28 overflow-auto border-2 border-[var(--line)] bg-[#221c27] p-2 rounded-lg text-[#f7f2e8]">
                      {JSON.stringify(latestResult.execution_result.output, null, 2)}
                    </pre>
                  </>
                ) : (
                  <div className="font-medium text-[var(--muted)]">
                    Action paused for human review or blocked before tool execution.
                  </div>
                )}

                {/* Quick Navigation to Approvals if Paused */}
                {latestResult.verdict === 'REQUIRE_APPROVAL' && onNavigate && (
                  <div className="mt-3 pt-3 border-t-2 border-[var(--line)]">
                    <button
                      onClick={() => onNavigate('Approvals')}
                      className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--amber)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 cursor-pointer"
                    >
                      <span>Review in Approvals Queue</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Scenarios Grid or Custom Tester */}
      {activeTab === 'presets' ? (
        loading ? (
          <Card className="p-8">
            <LoadingSpinner message="Loading preset simulation scenarios..." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((s) => {
              const isRunning = runningId === s.scenario_id;
              const isOfficialDemo = OFFICIAL_DEMOS.includes(s.scenario_id);

              return (
                <Card
                  key={s.scenario_id}
                  className={`flex flex-col justify-between p-5 transition-all ${
                    isOfficialDemo ? 'border-2 border-[var(--line)] bg-[var(--cyan)]/10 shadow-[3px_3px_0_var(--line)]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-[var(--line)] bg-[var(--panel2)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text)] uppercase">
                          {s.category}
                        </span>
                        {isOfficialDemo && (
                          <span className="rounded border border-[var(--line)] bg-[#8ed9d344] px-2 py-0.5 font-mono text-[10px] font-bold text-[#134e56] uppercase">
                            Official Demo
                          </span>
                        )}
                      </div>
                      <Badge kind={s.expected_verdict}>{s.expected_verdict}</Badge>
                    </div>

                    <h3 className="mt-3 font-bold text-[var(--text)] text-sm">{s.name}</h3>
                    <p className="mt-1.5 text-xs font-medium text-[var(--muted)] leading-relaxed">
                      {s.description}
                    </p>

                    <div className="mt-4 rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-2.5 font-mono text-[11px] font-bold text-[#134e56] shadow-[2px_2px_0_var(--line)]">
                      Tool: {s.sample_request?.tool_name}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t-2 border-[var(--line)]">
                    <button
                      disabled={isRunning}
                      onClick={() => handleRunPreset(s.scenario_id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-4 py-2.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="size-4 animate-spin text-[var(--text)]" />
                          Evaluating in Moss...
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5 fill-[var(--text)] text-[var(--text)]" />
                          Run Scenario
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Custom Action Evaluation Tester */
        <Card className="p-6">
          <h3 className="font-semibold text-white text-sm">Evaluate Custom Agent Tool Request</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Send arbitrary agent credentials and tool payloads directly to <code>POST /api/v1/guard/evaluate</code>
          </p>

          <form onSubmit={handleRunCustom} className="mt-5 space-y-4 text-xs">
            {customError && (
              <div className="rounded-lg border border-[#ff6d7a44] bg-[#ff6d7a12] p-3 text-[#ff6d7a]">
                {customError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                  Agent ID
                </label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-2 text-xs font-mono text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--cyan)]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                  Agent Role
                </label>
                <input
                  type="text"
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-2 text-xs font-mono text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--cyan)]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                  Tool Name
                </label>
                <input
                  type="text"
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-2 text-xs font-mono text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--cyan)]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                Tool Parameters (JSON)
              </label>
              <textarea
                rows={4}
                value={parametersJson}
                onChange={(e) => setParametersJson(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] p-3 font-mono text-xs text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--cyan)]/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                Agent Prompt / Context
              </label>
              <input
                type="text"
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-[var(--line)] bg-[#fffdfa] px-3 py-2 text-xs text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--cyan)]/40"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={customRunning}
                className="flex items-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[var(--cyan)] px-5 py-2.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {customRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin text-[var(--text)]" />
                    Evaluating in Sub-10ms...
                  </>
                ) : (
                  <>
                    <Play className="size-4 fill-[var(--text)] text-[var(--text)]" />
                    Evaluate Against AgentGuard
                  </>
                )}
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
