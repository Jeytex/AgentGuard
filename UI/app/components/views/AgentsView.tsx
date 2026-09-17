import React from 'react';
import { Bot, Terminal, Shield, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { AgentInfo } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { EmptyState, LoadingSpinner } from '../common/StatusStates';

interface AgentsViewProps {
  agents: AgentInfo[];
  loading: boolean;
}

export function AgentsView({ agents, loading }: AgentsViewProps) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Monitored Autonomous Agent Fleet</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Active AI agents operating under AgentGuard continuous policy enforcement
          </p>
        </div>
        <div className="text-xs text-[var(--muted)] font-medium">
          {agents.length} agents under governance
        </div>
      </div>

      {loading ? (
        <Card className="p-8">
          <LoadingSpinner message="Querying agent telemetry and operational status..." />
        </Card>
      ) : agents.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Bot}
            title="No agents registered"
            description="Agent status appears dynamically as actions are evaluated."
          />
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const isRestricted = a.status === 'restricted';
            const isReview = a.status === 'review_needed';
            const statusColor = isRestricted ? '#ff6d7a' : isReview ? '#e7b96b' : '#62d99a';
            const statusText = isRestricted ? 'Restricted' : isReview ? 'Review Needed' : 'Active';

            return (
              <Card key={a.agent_id} className="flex flex-col justify-between p-5">
                <div>
                  {/* Top Bar: Icon, Name & Status */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--cyan)]/15 text-[var(--cyan)]">
                        <Bot className="size-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">{a.name}</div>
                        <div className="font-mono text-[10px] text-[var(--muted)]">{a.agent_id}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-2.5 py-0.5 text-[10px]">
                      <span
                        style={{ backgroundColor: statusColor }}
                        className="size-2 rounded-full"
                      />
                      <span style={{ color: statusColor }} className="font-medium">
                        {statusText}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-[var(--muted)] leading-relaxed">
                    {a.description}
                  </p>

                  {/* Metadata Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-white/[0.02] p-2.5 border border-[var(--line)]">
                      <div className="text-[10px] text-[var(--muted)]">Role</div>
                      <div className="mt-1 font-medium text-white truncate">{a.role}</div>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] p-2.5 border border-[var(--line)]">
                      <div className="text-[10px] text-[var(--muted)]">Threat Risk</div>
                      <div className="mt-1">
                        <Badge kind={a.risk_level}>{a.risk_level}</Badge>
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] p-2.5 border border-[var(--line)]">
                      <div className="text-[10px] text-[var(--muted)]">Total Actions</div>
                      <div className="mt-1 font-mono font-semibold text-[var(--cyan)]">
                        {a.total_actions.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Allowed / Restricted Tools */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        Authorized Scope
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.allowed_tools.map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded border border-[#62d99a33] bg-[#62d99a0e] px-2 py-0.5 font-mono text-[10px] text-[var(--green)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {a.restricted_tools && a.restricted_tools.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          Restricted Boundaries
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.restricted_tools.map((t, idx) => (
                            <span
                              key={idx}
                              className="rounded border border-[#ff6d7a33] bg-[#ff6d7a0e] px-2 py-0.5 font-mono text-[10px] text-[#ff6d7a]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Last Action Bar */}
                {a.last_action && (
                  <div className="mt-5 rounded-xl border border-[var(--line)] bg-black/30 p-3 text-xs">
                    <div className="flex items-center justify-between text-[var(--muted)] text-[10px]">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> Last Intercepted Action
                      </span>
                      <span>{a.last_action.timestamp}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-mono text-xs text-white font-medium truncate max-w-[180px]">
                        {a.last_action.tool}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge kind={a.last_action.verdict}>{a.last_action.verdict}</Badge>
                        <span className="font-mono text-[11px] text-[var(--cyan)]">
                          {a.last_action.latency_ms.toFixed(1)}ms
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
