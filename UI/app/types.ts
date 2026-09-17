export type GuardVerdict = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PolicyCategory = 'financial' | 'destructive' | 'pii' | 'rbac' | 'compliance';

export interface LatencyBreakdown {
  moss_retrieval_ms: number;
  rule_evaluation_ms: number;
  total_latency_ms: number;
  native_moss_ms?: number | null;
}

export interface MatchedPolicy {
  policy_id: string;
  category: PolicyCategory;
  rule_text: string;
  score: number;
  enforcement: GuardVerdict;
  reason: string;
}

export interface ToolExecutionResult {
  executed: boolean;
  tool_name: string;
  status: string;
  output: Record<string, any>;
  executed_at: string;
  execution_time_ms: number;
}

export interface ActionEvaluationRequest {
  agent_id: string;
  agent_role: string;
  tool_name: string;
  parameters: Record<string, any>;
  context?: string;
  dry_run?: boolean;
}

export interface ActionEvaluationResponse {
  action_id: string;
  agent_id?: string;
  agent_role?: string;
  tool_name?: string;
  parameters?: Record<string, any>;
  verdict: GuardVerdict;
  risk_level: RiskLevel;
  risk_score: number;
  reason: string;
  matched_policies: MatchedPolicy[];
  approval_id?: string | null;
  execution_result?: ToolExecutionResult | null;
  latency: LatencyBreakdown;
  timestamp: string;
}

export interface AuditLogEntry {
  action_id: string;
  agent_id: string;
  agent_role: string;
  tool_name: string;
  parameters: Record<string, any>;
  verdict: GuardVerdict;
  risk_level: RiskLevel;
  risk_score: number;
  reason: string;
  latency: LatencyBreakdown;
  execution_result?: ToolExecutionResult | null;
  timestamp: string;
}

export interface PendingApproval {
  approval_id: string;
  action_id: string;
  agent_id: string;
  agent_role: string;
  tool_name: string;
  parameters: Record<string, any>;
  risk_level: RiskLevel;
  reason: string;
  matched_policies: MatchedPolicy[];
  created_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ApprovalDecisionRequest {
  decision: 'APPROVE' | 'REJECT';
  reviewed_by: string;
  reviewer_notes?: string;
}

export interface ApprovalDecisionResponse {
  approval_id: string;
  action_id: string;
  status: 'APPROVED' | 'REJECTED';
  resolved_by: string;
  resolved_at: string;
  reviewer_notes?: string | null;
  moss_memory_updated: boolean;
  execution_result?: ToolExecutionResult | null;
}

export interface Policy {
  id: string;
  category: PolicyCategory;
  name: string;
  rule_text: string;
  enforcement: GuardVerdict;
  risk_level: RiskLevel;
  target_tools: string[];
  conditions?: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
}

export interface PolicyCreateRequest {
  category: PolicyCategory;
  name: string;
  rule_text: string;
  enforcement: GuardVerdict;
  risk_level: RiskLevel;
  target_tools: string[];
  conditions?: Record<string, any>;
  is_active?: boolean;
}

export interface AgentLastAction {
  tool: string;
  verdict: GuardVerdict;
  timestamp: string;
  latency_ms: number;
}

export interface AgentInfo {
  agent_id: string;
  role: string;
  name: string;
  description: string;
  status: string;
  risk_level: RiskLevel;
  total_actions: number;
  last_action: AgentLastAction;
  allowed_tools: string[];
  restricted_tools: string[];
}

export interface LatencyStats {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  mean_ms: number;
  min_ms: number;
  max_ms: number;
}

export interface BenchmarkResult {
  total_queries: number;
  native_moss: LatencyStats;
  moss_retrieval: LatencyStats;
  total_pipeline: LatencyStats;
  moss?: LatencyStats;
  remote_vector_db: LatencyStats;
  speedup_factor: number;
  timestamp: string;
}

export interface SimulationScenario {
  scenario_id: string;
  name: string;
  description: string;
  category: string;
  expected_verdict: GuardVerdict;
  expected_risk: RiskLevel;
  sample_request: ActionEvaluationRequest;
}

export interface SystemHealth {
  status: string;
  moss_connected: boolean;
  active_mode: string;
  total_policies_indexed: number;
  total_incidents_indexed: number;
  uptime_seconds: number;
}

export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface WsActionEvaluatedEvent {
  event_type: 'ACTION_EVALUATED';
  data: ActionEvaluationResponse;
}

export interface WsApprovalResolvedEvent {
  event_type: 'APPROVAL_RESOLVED';
  data: ApprovalDecisionResponse;
}

export interface WsPongEvent {
  event_type: 'PONG';
}

export type WsServerMessage =
  | WsActionEvaluatedEvent
  | WsApprovalResolvedEvent
  | WsPongEvent;

export interface WsEventPayload<T = any> {
  event_type: 'ACTION_EVALUATED' | 'APPROVAL_RESOLVED' | 'PONG';
  data: T;
}

