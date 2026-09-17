'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ActionEvaluationResponse,
  AgentInfo,
  ApprovalDecisionResponse,
  AuditLogEntry,
  BenchmarkResult,
  PendingApproval,
  Policy,
  PolicyCreateRequest,
  SimulationScenario,
  SystemHealth,
} from './types';
import * as api from './services/api';
import { useAgentGuardWebSocket } from './hooks/useAgentGuardWebSocket';
import { Header } from './components/Header';
import { Sidebar, ViewType } from './components/Sidebar';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ActionDetailDrawer } from './components/modals/ActionDetailDrawer';
import { CreatePolicyModal } from './components/modals/CreatePolicyModal';
import { OverviewView } from './components/views/OverviewView';
import { InterceptionsView } from './components/views/InterceptionsView';
import { ApprovalsView } from './components/views/ApprovalsView';
import { PoliciesView } from './components/views/PoliciesView';
import { AgentsView } from './components/views/AgentsView';
import { BenchmarksView } from './components/views/BenchmarksView';
import { SimulatorView } from './components/views/SimulatorView';
import { AuditView } from './components/views/AuditView';

export default function App() {
  const [view, setView] = useState<ViewType>('Overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [interceptions, setInterceptions] = useState<AuditLogEntry[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch all initial dashboard data
  const loadAllData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [h, inter, appr, pol, ag, scen] = await Promise.allSettled([
        api.fetchHealth(),
        api.fetchInterceptions(100),
        api.fetchPendingApprovals(),
        api.fetchPolicies(),
        api.fetchAgents(),
        api.fetchScenarios(),
      ]);

      if (h.status === 'fulfilled') setHealth(h.value);
      if (inter.status === 'fulfilled') setInterceptions(inter.value);
      if (appr.status === 'fulfilled') setPendingApprovals(appr.value);
      if (pol.status === 'fulfilled') setPolicies(pol.value);
      if (ag.status === 'fulfilled') setAgents(ag.value);
      if (scen.status === 'fulfilled') setScenarios(scen.value);
    } catch (err: any) {
      console.error('Failed loading AgentGuard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Graceful fallback polling when WebSocket is disconnected or reconnecting
  const handleFallbackPoll = useCallback(async () => {
    try {
      const [inter, appr] = await Promise.allSettled([
        api.fetchInterceptions(100),
        api.fetchPendingApprovals(),
      ]);
      if (inter.status === 'fulfilled') setInterceptions(inter.value);
      if (appr.status === 'fulfilled') setPendingApprovals(appr.value);
    } catch {
      // quiet fallback
    }
  }, []);

  // Real-Time Event Handlers
  const handleLiveActionEvaluated = useCallback(
    (actionData: ActionEvaluationResponse) => {
      const newEntry: AuditLogEntry = {
        action_id: actionData.action_id,
        agent_id: actionData.agent_id || 'unknown',
        agent_role: actionData.agent_role || 'agent',
        tool_name: actionData.tool_name || 'tool',
        parameters: actionData.parameters || {},
        verdict: actionData.verdict,
        risk_level: actionData.risk_level,
        risk_score: actionData.risk_score,
        reason: actionData.reason,
        latency: actionData.latency || {
          moss_retrieval_ms: 0,
          rule_evaluation_ms: 0,
          total_latency_ms: 0,
        },
        execution_result: actionData.execution_result,
        timestamp: actionData.timestamp || new Date().toISOString(),
      };

      // Live interception updates + dynamic statistics update
      setInterceptions((prev) => {
        const exists = prev.some((x) => x.action_id === newEntry.action_id);
        if (exists) {
          return prev.map((item) => (item.action_id === newEntry.action_id ? { ...item, ...newEntry } : item));
        }
        return [newEntry, ...prev];
      });

      // Live approval queue update
      if (actionData.verdict === 'REQUIRE_APPROVAL' && actionData.approval_id) {
        const newApproval: PendingApproval = {
          approval_id: actionData.approval_id,
          action_id: actionData.action_id,
          agent_id: actionData.agent_id || 'unknown',
          agent_role: actionData.agent_role || 'agent',
          tool_name: actionData.tool_name || 'tool',
          parameters: actionData.parameters || {},
          risk_level: actionData.risk_level,
          reason: actionData.reason,
          matched_policies: actionData.matched_policies || [],
          created_at: actionData.timestamp || new Date().toISOString(),
          status: 'PENDING',
        };

        setPendingApprovals((prev) => {
          const exists = prev.some((p) => p.approval_id === newApproval.approval_id);
          return exists ? prev : [newApproval, ...prev];
        });

        addToast({
          type: 'info',
          title: 'Approval Required',
          detail: `${actionData.tool_name} requires supervisor decision.`,
        });
      }
    },
    [addToast]
  );

  const handleLiveApprovalResolved = useCallback(
    (resData: ApprovalDecisionResponse) => {
      // Remove resolved from pending approvals
      setPendingApprovals((prev) =>
        prev.filter((a) => a.approval_id !== resData.approval_id)
      );

      // Update verdict in interceptions audit list
      setInterceptions((prev) =>
        prev.map((item) => {
          if (item.action_id === resData.action_id) {
            return {
              ...item,
              verdict: resData.status === 'APPROVED' ? 'ALLOW' : 'BLOCK',
              execution_result: resData.execution_result || item.execution_result,
              reason: `Human review decision by ${resData.resolved_by}: ${
                resData.reviewer_notes || resData.status
              }`,
            };
          }
          return item;
        })
      );

      addToast({
        type: 'success',
        title: `Action ${resData.status}`,
        detail: `Decision recorded by ${resData.resolved_by}`,
      });
    },
    [addToast]
  );

  // Initialize Robust WebSocket hook
  const {
    status: wsStatus,
    reconnectAttempt,
    nextRetrySeconds,
    manualReconnect,
  } = useAgentGuardWebSocket({
    onActionEvaluated: handleLiveActionEvaluated,
    onApprovalResolved: handleLiveApprovalResolved,
    onFallbackPoll: handleFallbackPoll,
  });

  // REST Actions
  const handleDecideApproval = async (
    approvalId: string,
    decision: 'APPROVE' | 'REJECT',
    reviewerName: string,
    notes?: string
  ) => {
    try {
      const res = await api.submitApprovalDecision(approvalId, {
        decision,
        reviewed_by: reviewerName,
        reviewer_notes: notes,
      });

      setPendingApprovals((prev) => prev.filter((a) => a.approval_id !== approvalId));
      loadAllData();
      addToast({
        type: 'success',
        title: `Action ${res.status}`,
        detail: notes || `Approved action executed successfully`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Approval Decision Failed',
        detail: err.message,
      });
      throw err;
    }
  };

  const handleCreatePolicy = async (policy: PolicyCreateRequest) => {
    try {
      const newPol = await api.createPolicy(policy);
      setPolicies((prev) => [newPol, ...prev]);
      loadAllData();
      addToast({
        type: 'success',
        title: 'Policy Created & Indexed',
        detail: `Rule "${newPol.name}" loaded into Moss in-process memory`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Create Policy',
        detail: err.message,
      });
      throw err;
    }
  };

  const handleSeedPolicies = async () => {
    setSeeding(true);
    try {
      const res = await api.seedPolicies();
      await loadAllData();
      addToast({
        type: 'success',
        title: 'Policies Seeded into Moss',
        detail: `Indexed ${res.indexed_count} enterprise rules in ${res.time_taken_ms}ms`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Policy Seed Failed',
        detail: err.message,
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleRunBenchmark = async (iterations: number) => {
    setRunningBenchmark(true);
    try {
      const res = await api.runBenchmark(iterations);
      setBenchmarkResult(res);
      addToast({
        type: 'success',
        title: 'Benchmark Complete',
        detail: `Moss speedup: ${res.speedup_factor.toFixed(1)}x faster than cloud vector DB`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Benchmark Failed',
        detail: err.message,
      });
    } finally {
      setRunningBenchmark(false);
    }
  };

  const handleRunScenario = async (scenarioId: string): Promise<ActionEvaluationResponse> => {
    try {
      const res = await api.runScenario(scenarioId);
      handleLiveActionEvaluated(res);
      return res;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Scenario Execution Failed',
        detail: err.message,
      });
      throw err;
    }
  };

  const handleCustomEvaluate = async (req: any): Promise<ActionEvaluationResponse> => {
    try {
      const res = await api.evaluateAction(req);
      handleLiveActionEvaluated(res);
      return res;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Custom Evaluation Failed',
        detail: err.message,
      });
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header
        wsStatus={wsStatus}
        reconnectAttempt={reconnectAttempt}
        nextRetrySeconds={nextRetrySeconds}
        onManualReconnect={manualReconnect}
        onRefresh={() => loadAllData(true)}
        refreshing={refreshing}
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(!mobileOpen)}
        onOpenSimulator={() => setView('Simulator')}
      />

      <div className="flex">
        <Sidebar
          currentView={view}
          onSelectView={setView}
          pendingCount={pendingApprovals.length}
          health={health}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <main className="grid-bg min-h-[calc(100vh-4rem)] flex-1 overflow-hidden p-4 md:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* View Title Bar */}
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  AgentGuard Security Gateway / {view}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl mt-0.5">
                  {view}
                </h1>
              </div>

              {health && (
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--muted)]">
                  <span>Uptime: {Math.round(health.uptime_seconds)}s</span>
                  <span>•</span>
                  <span className="text-[var(--cyan)]">{health.active_mode}</span>
                </div>
              )}
            </div>

            {/* View Render with Production Error Boundary */}
            <ErrorBoundary fallbackTitle="AgentGuard Console Error">
              {view === 'Overview' && (
                <OverviewView
                  health={health}
                  interceptions={interceptions}
                  pendingCount={pendingApprovals.length}
                  benchmarkResult={benchmarkResult}
                  onOpenItem={setSelectedItem}
                  onNavigate={setView}
                />
              )}

              {view === 'Interceptions' && (
                <InterceptionsView
                  interceptions={interceptions}
                  loading={loading}
                  onOpenItem={setSelectedItem}
                />
              )}

              {view === 'Approvals' && (
                <ApprovalsView
                  approvals={pendingApprovals}
                  loading={loading}
                  onOpenItem={setSelectedItem}
                  onDecide={handleDecideApproval}
                />
              )}

              {view === 'Policies' && (
                <PoliciesView
                  policies={policies}
                  loading={loading}
                  onOpenCreate={() => setCreatePolicyOpen(true)}
                  onSeedPolicies={handleSeedPolicies}
                  seeding={seeding}
                />
              )}

              {view === 'Agents' && (
                <AgentsView agents={agents} loading={loading} />
              )}

              {view === 'Benchmarks' && (
                <BenchmarksView
                  benchmarkResult={benchmarkResult}
                  onRunBenchmark={handleRunBenchmark}
                  running={runningBenchmark}
                />
              )}

              {view === 'Simulator' && (
                <SimulatorView
                  scenarios={scenarios}
                  loading={loading}
                  onRunScenario={handleRunScenario}
                  onCustomEvaluate={handleCustomEvaluate}
                  onNavigate={setView}
                />
              )}

              {view === 'Audit / Incidents' && (
                <AuditView
                  interceptions={interceptions}
                  loading={loading}
                  onOpenItem={setSelectedItem}
                />
              )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Slide-over Action Detail Drawer */}
      <ActionDetailDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDecide={handleDecideApproval}
      />

      {/* Create Policy Modal */}
      <CreatePolicyModal
        isOpen={createPolicyOpen}
        onClose={() => setCreatePolicyOpen(false)}
        onSubmit={handleCreatePolicy}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
