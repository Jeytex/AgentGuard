import {
  ActionEvaluationRequest,
  ActionEvaluationResponse,
  AgentInfo,
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  AuditLogEntry,
  BenchmarkResult,
  PendingApproval,
  Policy,
  PolicyCreateRequest,
  SimulationScenario,
  SystemHealth,
} from '../types';

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_AGENTGUARD_API_URL) {
    return process.env.NEXT_PUBLIC_AGENTGUARD_API_URL;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
};

const API_BASE = getApiBase();

async function handleResponse<T>(res: Response, endpoint: string): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || JSON.stringify(errJson);
    } catch {
      // ignore
    }
    throw new Error(`API Error [${res.status}] at ${endpoint}: ${errorDetail}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  return handleResponse<SystemHealth>(res, '/health');
}

export async function fetchInterceptions(limit: number = 50): Promise<AuditLogEntry[]> {
  const res = await fetch(`${API_BASE}/interceptions?limit=${limit}`, { cache: 'no-store' });
  return handleResponse<AuditLogEntry[]>(res, '/interceptions');
}

export async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  const res = await fetch(`${API_BASE}/approvals/pending`, { cache: 'no-store' });
  return handleResponse<PendingApproval[]>(res, '/approvals/pending');
}

export async function submitApprovalDecision(
  approvalId: string,
  request: ApprovalDecisionRequest
): Promise<ApprovalDecisionResponse> {
  const res = await fetch(`${API_BASE}/approvals/${encodeURIComponent(approvalId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ApprovalDecisionResponse>(res, `/approvals/${approvalId}/decide`);
}

export async function fetchPolicies(
  category?: string,
  enforcement?: string
): Promise<Policy[]> {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.append('category', category);
  if (enforcement && enforcement !== 'all') params.append('enforcement', enforcement);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/policies${qs}`, { cache: 'no-store' });
  return handleResponse<Policy[]>(res, '/policies');
}

export async function createPolicy(policy: PolicyCreateRequest): Promise<Policy> {
  const res = await fetch(`${API_BASE}/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });
  return handleResponse<Policy>(res, '/policies');
}

export async function seedPolicies(): Promise<{
  status: string;
  indexed_count: number;
  time_taken_ms: number;
  mode: string;
}> {
  const res = await fetch(`${API_BASE}/policies/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse(res, '/policies/seed');
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch(`${API_BASE}/agents`, { cache: 'no-store' });
  return handleResponse<AgentInfo[]>(res, '/agents');
}

export async function runBenchmark(
  iterations: number = 50,
  warmup: number = 5
): Promise<BenchmarkResult> {
  const res = await fetch(`${API_BASE}/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iterations, warmup }),
  });
  return handleResponse<BenchmarkResult>(res, '/benchmark');
}

export async function fetchScenarios(): Promise<SimulationScenario[]> {
  const res = await fetch(`${API_BASE}/simulator/scenarios`, { cache: 'no-store' });
  return handleResponse<SimulationScenario[]>(res, '/simulator/scenarios');
}

export async function runScenario(scenarioId: string): Promise<ActionEvaluationResponse> {
  const res = await fetch(`${API_BASE}/simulator/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  return handleResponse<ActionEvaluationResponse>(res, '/simulator/run');
}

export async function evaluateAction(
  request: ActionEvaluationRequest
): Promise<ActionEvaluationResponse> {
  const res = await fetch(`${API_BASE}/guard/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ActionEvaluationResponse>(res, '/guard/evaluate');
}
