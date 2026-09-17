import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  CheckCircle2,
  Clock3,
  Cpu,
  FileText,
  Terminal,
  AlertTriangle,
  Loader2,
  UserCheck,
} from 'lucide-react';
import {
  GuardVerdict,
  LatencyBreakdown,
  MatchedPolicy,
  RiskLevel,
  ToolExecutionResult,
} from '../../types';
import { Badge, RiskScoreBadge } from '../common/Badge';

export interface InspectableItem {
  action_id?: string;
  id?: string;
  approval_id?: string | null;
  agent_id?: string;
  agent_role?: string;
  agent?: string;
  tool_name?: string;
  tool?: string;
  title?: string;
  time?: string;
  parameters?: Record<string, any>;
  verdict?: GuardVerdict;
  risk_level?: RiskLevel;
  risk_score?: number;
  risk?: number;
  reason?: string;
  status?: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  reviewer_notes?: string | null;
  matched_policies?: MatchedPolicy[];
  execution_result?: ToolExecutionResult | null;
  latency?: LatencyBreakdown;
  timestamp?: string;
  created_at?: string;
}

interface ActionDetailDrawerProps {
  item: InspectableItem | null;
  onClose: () => void;
  onDecide?: (
    approvalId: string,
    decision: 'APPROVE' | 'REJECT',
    reviewerName: string,
    notes?: string
  ) => Promise<void>;
}

export function ActionDetailDrawer({ item, onClose, onDecide }: ActionDetailDrawerProps) {
  const [reviewerName, setReviewerName] = useState('security-admin@agentguard.dev');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const toolName = item.tool_name || item.tool || item.title || 'Unknown Tool';
  const agentId = item.agent_id || item.agent || 'Unknown Agent';
  const agentRole = item.agent_role || 'Agent';
  const actionId = item.action_id || item.id || 'act_live';
  const approvalId = item.approval_id || null;

  const isResolved =
    item.status === 'APPROVED' ||
    item.status === 'REJECTED' ||
    (item.verdict !== 'REQUIRE_APPROVAL' && item.verdict !== undefined && !approvalId);

  const isPendingApproval =
    !isResolved &&
    (item.status === 'PENDING' ||
      (item.verdict === 'REQUIRE_APPROVAL' && Boolean(approvalId)));

  const riskScore = item.risk_score ?? item.risk ?? 0;
  const riskLevel = item.risk_level || 'LOW';
  const verdict: GuardVerdict = item.verdict || (item.status === 'PENDING' ? 'REQUIRE_APPROVAL' : 'ALLOW');
  const latency = item.latency;
  const matchedPolicies: MatchedPolicy[] = item.matched_policies || [];
  const executionResult = item.execution_result;

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!approvalId || !onDecide) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onDecide(approvalId, decision, reviewerName, reviewerNotes);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit decision';
      setActionError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="scrollbar flex h-full w-full max-w-2xl flex-col border-l border-[var(--line)] bg-[#0b0e12] p-6 shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--line)] pb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
              <ShieldAlert className="size-3 text-[var(--cyan)]" /> Action Inspection
            </div>
            <h2 className="mt-1.5 truncate text-xl font-semibold text-white">{toolName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--muted)]">
              <span>{actionId}</span>
              <span>•</span>
              <span className="text-[var(--cyan)]">{agentId}</span>
              <span>({agentRole})</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Security Verdict & Risk Bar */}
        <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div>
            <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider font-medium">
              Security Verdict
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge kind={verdict} size="md">
                {verdict}
              </Badge>
              {isResolved && item.status && (
                <span className="text-[11px] font-mono text-[var(--muted)]">
                  (Resolved: {item.status})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider font-medium">
              Threat Risk Level
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <RiskScoreBadge score={riskScore} />
              <Badge kind={riskLevel}>{riskLevel}</Badge>
            </div>
          </div>
        </div>

        {/* Reason / Explanation */}
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <FileText className="size-3.5 text-[var(--cyan)]" /> Decision Rationale
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#e1e7ed]">
            {item.reason || 'Action verified compliant with all security policies.'}
          </p>
        </div>

        {/* Latency Breakdown */}
        {latency && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Clock3 className="size-3.5 text-[var(--cyan)]" /> Sub-10ms Latency Breakdown
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-center">
                <div className="text-[10px] text-[var(--muted)]">Moss Retrieval</div>
                <div className="mt-1 font-mono text-base font-semibold text-[var(--cyan)]">
                  {latency.moss_retrieval_ms?.toFixed(2) ?? '0.00'} ms
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-center">
                <div className="text-[10px] text-[var(--muted)]">Rule Evaluation</div>
                <div className="mt-1 font-mono text-base font-semibold text-[var(--green)]">
                  {latency.rule_evaluation_ms?.toFixed(2) ?? '0.00'} ms
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-center">
                <div className="text-[10px] text-[var(--muted)]">Total Pipeline</div>
                <div className="mt-1 font-mono text-base font-semibold text-white">
                  {latency.total_latency_ms?.toFixed(2) ?? '0.00'} ms
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Matched Policies */}
        {matchedPolicies.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Cpu className="size-3.5 text-[var(--cyan)]" /> Matched Security Policies ({matchedPolicies.length})
            </div>
            <div className="space-y-2">
              {matchedPolicies.map((p: MatchedPolicy, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[var(--cyan)]">{p.policy_id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--muted)]">
                        Match: {Math.round(p.score * 100)}%
                      </span>
                      <Badge kind={p.enforcement}>{p.enforcement}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 font-medium text-white">{p.rule_text}</p>
                  {p.reason && (
                    <div className="mt-1.5 text-[11px] text-[var(--muted)]">
                      Violation: {p.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parameters */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Terminal className="size-3.5 text-[var(--cyan)]" /> Tool Parameters
          </div>
          <pre className="scrollbar max-h-52 overflow-auto rounded-xl border border-[var(--line)] bg-black/40 p-4 font-mono text-xs leading-5 text-[#9cb1c9]">
            {JSON.stringify(item.parameters || {}, null, 2)}
          </pre>
        </div>

        {/* Already Resolved Summary */}
        {(item.status === 'APPROVED' || item.status === 'REJECTED') && (
          <div className="mt-5 rounded-xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="size-4 text-[var(--cyan)]" />
                <span className="font-semibold text-white">Human Review Resolution</span>
              </div>
              <Badge kind={item.status}>{item.status}</Badge>
            </div>
            {item.resolved_by && (
              <div className="mt-2 text-[var(--muted)]">
                Decided by: <b className="text-white">{item.resolved_by}</b>
              </div>
            )}
            {item.reviewer_notes && (
              <div className="mt-1 text-[var(--muted)]">
                Notes: <span className="text-[#c6d4e2]">{item.reviewer_notes}</span>
              </div>
            )}
            {item.resolved_at && (
              <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                Resolved at: {new Date(item.resolved_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Tool Execution Result */}
        {executionResult && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <CheckCircle2 className="size-3.5 text-[var(--green)]" /> Tool Execution Outcome
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>Status: <b className="text-white uppercase">{executionResult.status}</b></span>
                <span>Latency: <b className="text-white">{executionResult.execution_time_ms.toFixed(2)} ms</b></span>
              </div>
              <pre className="scrollbar mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-[#9cb1c9]">
                {JSON.stringify(executionResult.output || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Human In The Loop Decision Actions */}
        {isPendingApproval && approvalId && onDecide && (
          <div className="mt-7 rounded-xl border border-[#e7b96b44] bg-[#e7b96b0c] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#e7b96b]">
              <AlertTriangle className="size-4" /> Human-in-the-Loop Approval Required
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              This action is paused. Authorize execution or block it from continuing.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Reviewer ID
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[var(--cyan)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Reviewer Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Authorized one-time VIP refund after customer phone call"
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[var(--cyan)]"
                />
              </div>

              {actionError && (
                <div className="rounded-lg border border-[#ff6d7a44] bg-[#ff6d7a12] p-3 text-xs text-[#ff6d7a]">
                  {actionError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  disabled={submitting}
                  onClick={() => handleDecision('APPROVE')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--green)] px-4 py-2.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Approve &amp; Execute
                </button>
                <button
                  disabled={submitting}
                  onClick={() => handleDecision('REJECT')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#ff6d7a66] bg-[#ff6d7a18] px-4 py-2.5 text-xs font-semibold text-[#ff6d7a] transition hover:bg-[#ff6d7a28] disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  Reject Action
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
