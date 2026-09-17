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

  const handleRunPreset = async (scenarioId: string) => {
    setRunningId(scenarioId);
    try {
      const res = await onRunScenario(scenarioId);
      setLatestResult(res);
    } finally {
      setRunningId(null);
    }
  };

  const handleRunCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
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
      setCustomError(err?.message || 'Evaluation failed');
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
            <div className="rounded-xl bg-[var(--cyan)]/15 p-3 text-[var(--cyan)]">
              <Terminal className="size-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Live Attack &amp; Guardrail Simulator
              </h2>
              <p className="mt-1 max-w-xl text-xs text-[var(--muted)] leading-relaxed">
                Trigger preset attacks, privilege escalations, and benign workflows against your live
                FastAPI security engine. Watch Moss intercept and enforce policies in sub-10ms.
              </p>
            </div>
          </div>

          <div className="flex rounded-xl border border-[var(--line)] bg-black/40 p-1 text-xs">
            <button
              onClick={() => setActiveTab('presets')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'presets' ? 'bg-white/10 text-white shadow' : 'text-[var(--muted)] hover:text-white'
              }`}
            >
              Preset Scenarios ({scenarios.length})
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'custom' ? 'bg-white/10 text-white shadow' : 'text-[var(--muted)] hover:text-white'
              }`}
            >
              Custom Action Tester
            </button>
          </div>
        </div>
      </Card>

      {/* Latest Evaluation Result Banner */}
      {latestResult && (
        <Card className="border-[var(--cyan)]/30 bg-[#56d8e40a] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[var(--line)] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-[var(--cyan)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
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
              <div className="rounded-lg bg-black/40 px-3 py-1.5 border border-[var(--line)]">
                <span className="text-[var(--muted)]">Moss Retrieval: </span>
                <span className="text-[var(--cyan)] font-semibold">
                  {latestResult.latency?.moss_retrieval_ms?.toFixed(2) ?? '0.00'} ms
                </span>
              </div>
              <div className="rounded-lg bg-black/40 px-3 py-1.5 border border-[var(--line)]">
                <span className="text-[var(--muted)]">Total Pipeline: </span>
                <span className="text-[var(--green)] font-semibold">
                  {latestResult.latency?.total_latency_ms?.toFixed(2) ?? '0.00'} ms
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 text-xs lg:grid-cols-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Security Rationale
              </div>
              <p className="mt-1 text-[#d6e3f0] leading-relaxed">{latestResult.reason}</p>

              {latestResult.matched_policies?.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Matched Violation Policies ({latestResult.matched_policies.length})
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {latestResult.matched_policies.map((p, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-[var(--line)] bg-black/30 p-2 text-[11px]"
                      >
                        <div className="flex justify-between font-mono text-[var(--cyan)]">
                          <span>{p.policy_id}</span>
                          <span>Score: {Math.round(p.score * 100)}%</span>
                        </div>
                        <div className="mt-1 text-white">{p.rule_text}</div>
                        {p.reason && (
                          <div className="mt-1 text-[10px] text-[var(--muted)]">
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Tool Execution Status
              </div>
              <div className="mt-1 rounded-lg border border-[var(--line)] bg-black/40 p-3 font-mono text-[11px]">
                {latestResult.execution_result ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {latestResult.execution_result.status === 'success' ? (
                          <ShieldCheck className="size-4 text-[var(--green)]" />
                        ) : latestResult.execution_result.status === 'blocked' ? (
                          <ShieldX className="size-4 text-[#ff6d7a]" />
                        ) : (
                          <AlertTriangle className="size-4 text-[#e7b96b]" />
                        )}
                        <span className="text-white">
                          Status:{' '}
                          <span
                            className={`uppercase font-bold ${
                              latestResult.execution_result.status === 'success'
                                ? 'text-[var(--green)]'
                                : latestResult.execution_result.status === 'blocked'
                                ? 'text-[#ff6d7a]'
                                : 'text-[#e7b96b]'
                            }`}
                          >
                            {latestResult.execution_result.status}
                          </span>
                        </span>
                      </div>
                      <span className="text-[var(--muted)]">
                        {latestResult.execution_result.execution_time_ms.toFixed(2)} ms
                      </span>
                    </div>

                    <pre className="scrollbar mt-2 max-h-28 overflow-auto text-[#8ea7c2] border-t border-[var(--line)]/50 pt-2">
                      {JSON.stringify(latestResult.execution_result.output, null, 2)}
                    </pre>
                  </>
                ) : (
                  <div className="text-[var(--muted)]">
                    Action paused for human review or blocked before tool execution.
                  </div>
                )}

                {/* Quick Navigation to Approvals if Paused */}
                {latestResult.verdict === 'REQUIRE_APPROVAL' && onNavigate && (
                  <div className="mt-3 pt-3 border-t border-[var(--line)]">
                    <button
                      onClick={() => onNavigate('Approvals')}
                      className="flex items-center gap-1.5 rounded-lg bg-[#e7b96b] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
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
                    isOfficialDemo ? 'border-[var(--cyan)]/30 bg-white/[0.015]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[var(--muted)] uppercase">
                          {s.category}
                        </span>
                        {isOfficialDemo && (
                          <span className="rounded bg-[var(--cyan)]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--cyan)] uppercase">
                            Official Demo
                          </span>
                        )}
                      </div>
                      <Badge kind={s.expected_verdict}>{s.expected_verdict}</Badge>
                    </div>

                    <h3 className="mt-3 font-semibold text-white text-sm">{s.name}</h3>
                    <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">
                      {s.description}
                    </p>

                    <div className="mt-4 rounded-lg bg-black/30 p-2.5 font-mono text-[11px] text-[var(--cyan)] border border-[var(--line)]">
                      Tool: {s.sample_request?.tool_name}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[var(--line)]">
                    <button
                      disabled={isRunning}
                      onClick={() => handleRunPreset(s.scenario_id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cyan)] px-4 py-2.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Evaluating in Moss...
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5 fill-black" />
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
                <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                  Agent ID
                </label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
                />
              </div>

              <div>
                <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                  Agent Role
                </label>
                <input
                  type="text"
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
                />
              </div>

              <div>
                <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                  Tool Name
                </label>
                <input
                  type="text"
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Tool Parameters (JSON)
              </label>
              <textarea
                rows={4}
                value={parametersJson}
                onChange={(e) => setParametersJson(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 p-3 font-mono text-white outline-none focus:border-[var(--cyan)]"
              />
            </div>

            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Agent Prompt / Context
              </label>
              <input
                type="text"
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={customRunning}
                className="flex items-center gap-2 rounded-xl bg-[var(--cyan)] px-5 py-2.5 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
              >
                {customRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Evaluating in Sub-10ms...
                  </>
                ) : (
                  <>
                    <Play className="size-4 fill-black" />
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
