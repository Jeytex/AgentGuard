from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class GuardVerdict(str, Enum):
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PolicyCategory(str, Enum):
    FINANCIAL = "financial"
    DESTRUCTIVE = "destructive"
    PII = "pii"
    RBAC = "rbac"
    COMPLIANCE = "compliance"


class LatencyBreakdown(BaseModel):
    moss_retrieval_ms: float = Field(..., description="Moss retrieval latency in ms")
    rule_evaluation_ms: float = Field(..., description="Fast-path rule evaluation latency in ms")
    total_latency_ms: float = Field(..., description="Total AgentGuard end-to-end latency in ms")
    native_moss_ms: Optional[float] = Field(None, description="Native in-process Moss C/Rust engine search latency in ms")



class MatchedPolicy(BaseModel):
    policy_id: str
    category: PolicyCategory
    rule_text: str
    score: float = Field(..., ge=0.0, le=1.0, description="Semantic similarity score")
    enforcement: GuardVerdict
    reason: str


class ActionEvaluationRequest(BaseModel):
    agent_id: str = Field(..., json_schema_extra={"example": "customer-support-bot"})
    agent_role: str = Field(..., json_schema_extra={"example": "tier_1_support"})
    tool_name: str = Field(..., json_schema_extra={"example": "stripe_issue_refund"})
    parameters: Dict[str, Any] = Field(default_factory=dict, json_schema_extra={"example": {"amount": 1500, "customer_id": "cust_88219"}})
    context: Optional[str] = Field(None, json_schema_extra={"example": "Customer requested full refund due to order delay."})
    dry_run: bool = Field(False, description="If true, do not persist to audit log or trigger real approvals")


from app.engine.executor import ToolExecutionResult


class ActionEvaluationResponse(BaseModel):
    action_id: str
    agent_id: Optional[str] = None
    agent_role: Optional[str] = None
    tool_name: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    verdict: GuardVerdict
    risk_level: RiskLevel
    risk_score: int = Field(..., ge=0, le=100)
    reason: str
    matched_policies: List[MatchedPolicy]
    approval_id: Optional[str] = None
    execution_result: Optional[ToolExecutionResult] = None
    latency: LatencyBreakdown
    timestamp: str



class PolicyCreateRequest(BaseModel):
    category: PolicyCategory
    name: str
    rule_text: str
    enforcement: GuardVerdict = GuardVerdict.BLOCK
    risk_level: RiskLevel = RiskLevel.HIGH
    target_tools: List[str] = Field(default_factory=lambda: ["*"])
    conditions: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: bool = True


class Policy(BaseModel):
    id: str
    category: PolicyCategory
    name: str
    rule_text: str
    enforcement: GuardVerdict
    risk_level: RiskLevel
    target_tools: List[str]
    conditions: Optional[Dict[str, Any]] = None
    is_active: bool = True
    created_at: str


class PendingApproval(BaseModel):
    approval_id: str
    action_id: str
    agent_id: str
    agent_role: str
    tool_name: str
    parameters: Dict[str, Any]
    risk_level: RiskLevel
    reason: str
    matched_policies: List[MatchedPolicy]
    created_at: str
    status: str = Field("PENDING", description="PENDING | APPROVED | REJECTED")


class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(APPROVE|REJECT)$")
    reviewer_notes: Optional[str] = None
    reviewed_by: str = Field(..., json_schema_extra={"example": "admin@agentguard.dev"})


class ApprovalDecisionResponse(BaseModel):
    approval_id: str
    action_id: str
    status: str
    resolved_by: str
    resolved_at: str
    reviewer_notes: Optional[str] = None
    moss_memory_updated: bool = True
    execution_result: Optional[ToolExecutionResult] = None



class LatencyStats(BaseModel):
    p50_ms: float
    p95_ms: float
    p99_ms: float
    mean_ms: float
    min_ms: float
    max_ms: float


class BenchmarkResult(BaseModel):
    total_queries: int
    native_moss: LatencyStats = Field(
        ...,
        description="Native in-process Moss search latency from res.time_taken_ms (pure C/Rust index search)",
    )
    moss_retrieval: LatencyStats = Field(
        ...,
        description="Total Moss retrieval latency via Python SDK (including local embedding, IPC, and doc deserialization)",
    )
    total_pipeline: LatencyStats = Field(
        ...,
        description="Total end-to-end AgentGuard pipeline latency (pre-triage + Moss retrieval + deterministic policy evaluation + verdict)",
    )
    moss: LatencyStats = Field(
        ...,
        description="Legacy alias for backwards compatibility with UI (reports moss_retrieval)",
    )
    remote_vector_db: LatencyStats
    speedup_factor: float
    timestamp: str


class SystemHealth(BaseModel):
    status: str
    moss_connected: bool
    active_mode: str
    total_policies_indexed: int
    total_incidents_indexed: int
    uptime_seconds: float


class SimulationScenario(BaseModel):
    scenario_id: str
    name: str
    description: str
    category: str
    expected_verdict: GuardVerdict
    expected_risk: RiskLevel
    sample_request: ActionEvaluationRequest


class AgentLastAction(BaseModel):
    tool: str
    verdict: GuardVerdict
    timestamp: str
    latency_ms: float


class AgentInfo(BaseModel):
    agent_id: str
    role: str
    name: str
    description: str
    status: str
    risk_level: RiskLevel
    total_actions: int
    last_action: AgentLastAction
    allowed_tools: List[str]
    restricted_tools: List[str]

