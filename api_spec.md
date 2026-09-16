# AgentGuard — Backend API Specification & Contract

> **Version:** 1.0.0  
> **Base URL:** `http://localhost:8000/api/v1`  
> **WebSocket URL:** `ws://localhost:8000/api/v1/events/ws`  
> **Interactive Swagger Docs:** `http://localhost:8000/docs`  
> **OpenAPI JSON:** `http://localhost:8000/openapi.json`  
>
> *Note for Frontend Developers (Claude / React):* All API requests accept and return standard `application/json`. Permissive CORS is enabled (`*`). Every decision returns high-resolution latency breakdowns.

---

## 1. Core Data Models & TypeScript Interfaces

Frontend developers can copy these exact TypeScript interfaces:

```typescript
export type GuardVerdict = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PolicyCategory = "financial" | "destructive" | "pii" | "rbac" | "compliance";

export interface LatencyBreakdown {
  moss_retrieval_ms: number;   // Sub-10ms Moss search time
  rule_evaluation_ms: number;  // Fast-path rule evaluation time
  total_latency_ms: number;    // End-to-end AgentGuard processing time
}

export interface MatchedPolicy {
  policy_id: string;
  category: PolicyCategory;
  rule_text: string;
  score: number;               // Semantic similarity score (0.0 to 1.0)
  enforcement: GuardVerdict;
  reason: string;
}

export interface ActionEvaluationRequest {
  agent_id: string;            // e.g. "finance-agent-01"
  agent_role: string;          // e.g. "support", "junior_analyst", "admin"
  tool_name: string;           // e.g. "stripe_refund", "execute_sql", "send_email"
  parameters: Record<string, any>; // e.g. { "amount": 2500, "customer_id": "c_99" }
  context?: string;            // Optional user prompt or conversation context
  dry_run?: boolean;           // If true, evaluate without recording to audit log
}

export interface ActionEvaluationResponse {
  action_id: string;           // Unique UUID for this action execution
  verdict: GuardVerdict;       // "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL"
  risk_level: RiskLevel;       // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  risk_score: number;          // 0 to 100
  reason: string;              // Human-readable justification
  matched_policies: MatchedPolicy[];
  approval_id?: string;        // Present if verdict == "REQUIRE_APPROVAL"
  latency: LatencyBreakdown;
  timestamp: string;           // ISO 8601
}

export interface Policy {
  id: string;
  category: PolicyCategory;
  name: string;
  rule_text: string;           // Natural language policy statement
  enforcement: GuardVerdict;   // Default verdict if violated
  risk_level: RiskLevel;
  target_tools: string[];      // e.g. ["stripe_*", "db_query"]
  conditions?: Record<string, any>; // e.g. { "max_amount": 1000, "allowed_roles": ["admin"] }
  is_active: boolean;
  created_at: string;
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
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface ApprovalDecisionRequest {
  decision: "APPROVE" | "REJECT";
  reviewer_notes?: string;
  reviewed_by: string;         // e.g. "admin@agentguard.dev"
}

export interface BenchmarkResult {
  total_queries: number;
  moss: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    mean_ms: number;
    min_ms: number;
    max_ms: number;
  };
  remote_vector_db: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    mean_ms: number;
    min_ms: number;
    max_ms: number;
  };
  speedup_factor: number;      // e.g. 52.4x faster
  timestamp: string;
}

export interface SystemHealth {
  status: "ok" | "degraded";
  moss_connected: boolean;
  active_mode: "live_moss" | "fallback_mock";
  total_policies_indexed: number;
  total_incidents_indexed: number;
  uptime_seconds: number;
}
```

---

## 2. REST Endpoints

### 2.1 Action Guard Evaluation (Hot Path)

#### `POST /api/v1/guard/evaluate`
Intercepts an agent tool request, retrieves relevant policies using Moss, evaluates rules, and returns a verdict in `<10ms`.

- **Response Headers:**
  - `X-Moss-Retrieval-Ms: 3.4`
  - `X-Guard-Total-Ms: 6.2`
  - `X-Guard-Verdict: ALLOW`

- **Request Example:**
```json
{
  "agent_id": "customer-support-bot",
  "agent_role": "tier_1_support",
  "tool_name": "stripe_issue_refund",
  "parameters": {
    "amount": 1500,
    "currency": "USD",
    "customer_id": "cust_88219"
  },
  "context": "Customer is unsatisfied with delivery delay, requested full refund."
}
```

- **Response Example (`REQUIRE_APPROVAL`):**
```json
{
  "action_id": "act_f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "verdict": "REQUIRE_APPROVAL",
  "risk_level": "HIGH",
  "risk_score": 75,
  "reason": "Refund amount ($1500) exceeds automatic allowance ($1000) for role 'tier_1_support'.",
  "matched_policies": [
    {
      "policy_id": "pol_fin_001",
      "category": "financial",
      "rule_text": "Refunds greater than $1,000 require supervisor approval.",
      "score": 0.94,
      "enforcement": "REQUIRE_APPROVAL",
      "reason": "Parameter 'amount' (1500) > threshold (1000)"
    }
  ],
  "approval_id": "appr_7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "latency": {
    "moss_retrieval_ms": 3.2,
    "rule_evaluation_ms": 1.1,
    "total_latency_ms": 5.8
  },
  "timestamp": "2026-09-16T05:00:00.123Z"
}
```

- **Response Example (`BLOCK`):**
```json
{
  "action_id": "act_88b12f71-2910-449e-b14a-112233445566",
  "verdict": "BLOCK",
  "risk_level": "CRITICAL",
  "risk_score": 98,
  "reason": "Attempted destructive SQL operation on production environment.",
  "matched_policies": [
    {
      "policy_id": "pol_destr_002",
      "category": "destructive",
      "rule_text": "Never drop, truncate, or alter production tables without explicit SuperAdmin approval.",
      "score": 0.98,
      "enforcement": "BLOCK",
      "reason": "SQL contains prohibited keyword 'DROP TABLE'"
    }
  ],
  "latency": {
    "moss_retrieval_ms": 2.8,
    "rule_evaluation_ms": 0.9,
    "total_latency_ms": 4.5
  },
  "timestamp": "2026-09-16T05:00:01.456Z"
}
```

---

### 2.2 Policy Management & Moss Indexing

#### `GET /api/v1/policies`
Lists all active enterprise security policies loaded in AgentGuard and indexed in Moss.
- **Query Params:** `category` (optional), `enforcement` (optional)
- **Response:** Array of `Policy` objects.

#### `POST /api/v1/policies`
Creates a new policy, updates the local store, and dynamically indexes it into the Moss runtime.
- **Request Body:** `Policy` object (without `id` and `created_at`).
- **Response:** Created `Policy` object with assigned ID.

#### `POST /api/v1/policies/seed`
One-click endpoint to seed 15+ preconfigured enterprise guardrail policies into the system and sync them directly into Moss.
- **Response:** `{ "status": "success", "indexed_count": 15, "moss_time_ms": 142.5 }`

---

### 2.3 Human-in-the-Loop (HITL) Approvals

#### `GET /api/v1/approvals/pending`
Returns all actions paused in the `PENDING` state awaiting human review.
- **Response:** Array of `PendingApproval` objects.

#### `POST /api/v1/approvals/{approval_id}/decide`
Admin submits verdict on a paused action.
- **Request Body:**
```json
{
  "decision": "APPROVE",
  "reviewer_notes": "Authorized one-time exception due to damaged VIP delivery.",
  "reviewed_by": "security-admin@agentguard.dev"
}
```
- **Response:**
```json
{
  "approval_id": "appr_7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "APPROVED",
  "action_id": "act_f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "resolved_at": "2026-09-16T05:01:20.789Z",
  "moss_memory_updated": true
}
```

---

### 2.4 Latency Benchmark Suite

#### `POST /api/v1/benchmark`
Runs an automated side-by-side latency benchmark testing 50 real queries against:
1. **Local Moss In-Memory Search**
2. **Traditional Remote Vector Database** (simulated/cloud round-trip)

- **Request Body:**
```json
{
  "iterations": 50,
  "warmup": 5
}
```
- **Response:** Returns `BenchmarkResult` with P50, P95, P99, Mean, and Speedup Factor.

---

### 2.5 Attack & Scenario Simulator

#### `GET /api/v1/simulator/scenarios`
Returns a list of pre-configured simulation scenarios ready to run from the UI.
- **Scenarios provided:**
  - `benign_calendar`: Benign tool call (`ALLOW`, 4ms)
  - `excessive_refund`: Financial limit trigger (`REQUIRE_APPROVAL`, 5ms)
  - `sql_drop_table`: Destructive SQL injection (`BLOCK`, 4ms)
  - `pii_ssn_leak`: PII exfiltration attempt (`BLOCK`, 5ms)
  - `privilege_escalation`: Low-role agent invoking admin endpoint (`BLOCK`, 4ms)

#### `POST /api/v1/simulator/run`
Executes a specific scenario through the evaluation pipeline and returns the result immediately.
- **Request Body:** `{ "scenario_id": "sql_drop_table" }`
- **Response:** Standard `ActionEvaluationResponse`.

---

### 2.6 System Health & Telemetry

#### `GET /api/v1/health`
Returns system status, active Moss mode (`live_moss` vs `fallback_mock`), indexed policy counts, and uptime.

---

## 3. Real-Time WebSocket Event Stream

### `WS /api/v1/events/ws`
Full-duplex WebSocket connection for real-time dashboard updates.

#### Server-to-Client Messages
Whenever an action is evaluated or an approval is updated, a message is broadcast to all connected frontend clients.

```json
{
  "event_type": "ACTION_EVALUATED",
  "data": {
    "action_id": "act_f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "agent_id": "customer-support-bot",
    "tool_name": "stripe_issue_refund",
    "verdict": "REQUIRE_APPROVAL",
    "risk_level": "HIGH",
    "latency_ms": 5.8,
    "moss_retrieval_ms": 3.2,
    "timestamp": "2026-09-16T05:00:00.123Z"
  }
}
```

When an approval request is resolved:
```json
{
  "event_type": "APPROVAL_RESOLVED",
  "data": {
    "approval_id": "appr_7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "action_id": "act_f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "APPROVED",
    "resolved_by": "security-admin@agentguard.dev"
  }
}
```

---

## 4. Frontend Integration Guidelines (For Claude)

1. **API Base URL Configuration:**  
   Configure the frontend to use `import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"` and `VITE_WS_URL || "ws://localhost:8000/api/v1/events/ws"`.
2. **Key Dashboard Views to Render:**
   - **Live Guardrail Feed:** Real-time stream of intercepted tool calls showing verdict pills (Green: `ALLOW`, Red: `BLOCK`, Amber: `REQUIRE_APPROVAL`) and exact Moss latency badges (`3.2ms`).
   - **HITL Approval Center:** Cards for pending requests with tool parameters, matched violation policies, and one-click "Approve" / "Reject" buttons.
   - **Zero-Latency Benchmark Tab:** Side-by-side comparison chart showing Moss (<5ms) vs Traditional Vector DB (300-600ms) with P50/P95/P99 latency cards and a "Run Benchmark" button.
   - **Interactive Attack Simulator:** Dropdown or buttons to trigger preset scenarios (`sql_drop_table`, `excessive_refund`, etc.) and instantly watch them evaluate in real time.
   - **Policy Manager:** List of active policies with category badges and an "Add Policy" modal.
