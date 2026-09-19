import React, { useState } from 'react';
import {
  Inbox,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronRight,
  Shield,
  Loader2,
  Clock3,
} from 'lucide-react';
import { PendingApproval } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { EmptyState, LoadingSpinner } from '../common/StatusStates';

interface ApprovalsViewProps {
  approvals: PendingApproval[];
  loading: boolean;
  onOpenItem: (item: PendingApproval) => void;
  onDecide: (
    approvalId: string,
    decision: 'APPROVE' | 'REJECT',
    reviewerName: string,
    notes?: string
  ) => Promise<void>;
}

export function ApprovalsView({
  approvals,
  loading,
  onOpenItem,
  onDecide,
}: ApprovalsViewProps) {
  const [actingId, setActingId] = useState<string | null>(null);

  const handleQuickDecision = async (
    e: React.MouseEvent,
    approvalId: string,
    decision: 'APPROVE' | 'REJECT'
  ) => {
    e.stopPropagation();
    setActingId(approvalId);
    try {
      await onDecide(
        approvalId,
        decision,
        'security-admin@agentguard.dev',
        decision === 'APPROVE' ? 'Quick approval from Approvals Console' : 'Declined via Approvals Console'
      );
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      {/* Left Column: Pending Approvals Queue */}
      <Card>
        <div className="flex items-center justify-between border-b-2 border-[var(--line)] p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">Pending Human Approvals</h2>
            <span className="rounded-full border border-[var(--line)] bg-[var(--amber)]/25 px-2.5 py-0.5 text-xs font-bold text-[#6d4508]">
              {approvals.length} pending
            </span>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading pending human-in-the-loop approvals..." />
        ) : approvals.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All caught up!"
            description="There are currently no actions paused in the approval queue. High-threshold actions will appear here automatically."
          />
        ) : (
          <div className="divide-y-2 divide-[var(--line)]">
            {approvals.map((item) => {
              const isActing = actingId === item.approval_id;
              return (
                <div
                  key={item.approval_id}
                  onClick={() => onOpenItem(item)}
                  className="cursor-pointer p-5 transition hover:bg-[var(--cyan)]/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)] text-sm">{item.tool_name}</span>
                        <Badge kind={item.risk_level}>{item.risk_level}</Badge>
                      </div>
                      <div className="mt-1 font-mono text-xs font-bold text-[#134e56]">
                        Agent: {item.agent_id} ({item.agent_role})
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-medium text-[var(--muted)]">
                      {new Date(item.created_at).toLocaleTimeString()}
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed font-medium text-[var(--text)]">
                    {item.reason}
                  </p>

                  {/* Parameters Excerpt */}
                  <div className="mt-3 rounded-xl border-2 border-[var(--line)] bg-[#221c27] p-2.5 font-mono text-[11px] text-[#f7f2e8] shadow-[2px_2px_0_var(--line)]">
                    {JSON.stringify(item.parameters)}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      onClick={() => onOpenItem(item)}
                      className="text-xs font-bold text-[var(--text)] hover:opacity-75 flex items-center gap-1 cursor-pointer"
                    >
                      View full details &amp; policies <ChevronRight className="size-3.5" />
                    </button>

                    <div className="flex gap-2">
                      <button
                        disabled={isActing}
                        onClick={(e) => handleQuickDecision(e, item.approval_id, 'REJECT')}
                        className="rounded-xl border-2 border-[var(--line)] bg-[var(--red)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {isActing ? <Loader2 className="size-3.5 animate-spin" /> : 'Reject'}
                      </button>
                      <button
                        disabled={isActing}
                        onClick={(e) => handleQuickDecision(e, item.approval_id, 'APPROVE')}
                        className="rounded-xl border-2 border-[var(--line)] bg-[var(--green)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-[2px_2px_0_var(--line)] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {isActing ? <Loader2 className="size-3.5 animate-spin" /> : 'Approve & Execute'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Right Column: Guidance & Policies Context */}
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 text-[#6d4508]">
            <AlertTriangle className="size-5" />
            <h2 className="font-bold text-[var(--text)]">Reviewer Operations Policy</h2>
          </div>
          <p className="mt-3 text-xs leading-relaxed font-medium text-[var(--muted)]">
            Actions are paused by AgentGuard when they exceed preset corporate financial thresholds,
            attempt bulk customer data exports, or involve sensitive payment operations.
          </p>
          <div className="mt-4 space-y-2 border-t-2 border-[var(--line)] pt-4 text-xs">
            <div className="text-[var(--text)] font-bold">Automatic execution on approval:</div>
            <p className="text-[var(--muted)] font-medium leading-5">
              Approving an action automatically releases it to the tool executor and indexes the
              favorable decision into Moss incident memory for future contextual safety inference.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3 text-[#134e56]">
            <Clock3 className="size-5" />
            <h2 className="font-bold text-[var(--text)]">Real-Time SLA</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed font-medium text-[var(--muted)]">
            Standard supervisor SLA for paused agent workflows is under 5 minutes. WebSocket clients
            receive instant notifications the moment a human resolution is broadcast.
          </p>
        </Card>
      </div>
    </div>
  );
}
