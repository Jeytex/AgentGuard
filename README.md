# AgentGuard

<div align="center">

[![CI/CD Pipeline](https://github.com/Jeytex/AgentGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/Jeytex/AgentGuard/actions)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.3-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)
![Docker](https://img.shields.io/badge/docker-compose-2496ED.svg)
![Tests](https://img.shields.io/badge/tests-62%20passed-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Sub-10ms Real-Time Security and Reliability Gateway for Autonomous AI Agents**

*Enterprise policy enforcement, human-in-the-loop approvals, in-process semantic retrieval with Moss, and full-stack SecOps console.*

[Architecture](#system-architecture) •
[Quickstart](#quickstart) •
[Configuration & Secrets](#configuration--secrets-management) •
[API Reference](#api-usage--reference) •
[Testing](#testing--code-quality)

</div>

---

## 1. Executive Summary & Problem Statement

### The Agentic Security Dilemma
As AI agents transition from conversational chatbots to autonomous actors performing real-world mutations—such as executing database transactions, processing refunds, altering cloud infrastructure, sending external emails, and handling customer PII—they introduce critical enterprise attack surfaces:

- **Prompt Injection & Jailbreaks:** Adversarial instructions embedded in untrusted external data or tool outputs.
- **Catastrophic Parameter Drift:** Unauthorized destruction (`DROP TABLE`, `rm -rf`), out-of-bounds numbers, or invalid recipient accounts.
- **Privilege Escalation:** Agents attempting actions exceeding their assigned role or domain.
- **Compliance Violations:** Breaches of SOC2, HIPAA, GDPR, or internal corporate policy.

### The Latency Dilemma
Traditional guardrail solutions query remote vector databases (Pinecone, Qdrant, remote Chroma) and invoke external LLMs:
- **Remote Vector Search:** 250ms – 600ms network round-trip.
- **Remote LLM Evaluator:** 800ms – 2,500ms inference time.
- **Total Latency Penalty:** **1.0s – 3.0s per tool call**.

In real-time voice agents, interactive customer copilots, and multi-step agent chains, adding seconds to every tool execution completely degrades user experience.

### The AgentGuard Solution
AgentGuard embeds **Moss**—the sub-10ms in-process semantic search runtime—directly into the agent's hot execution path. By storing active policies, RBAC rules, negative constraints, and historical incident precedents in Moss in-memory indexes, AgentGuard retrieves relevant security context in **3–5ms**. Paired with deterministic fast-path rule evaluation and schema sanitization, AgentGuard delivers a verdict (**ALLOW**, **BLOCK**, or **REQUIRE_APPROVAL**) in **under 10ms**.

---

## 2. System Architecture

```mermaid
flowchart TD
    subgraph Agent_Loop["Autonomous Agent Ecosystem (LangChain / CrewAI / AutoGen / Voice Agent)"]
        Agent[Autonomous AI Agent]
        ProposedAction["Proposed Action / Tool Call\n(e.g., stripe_refund, db_query, crm_export)"]
        Agent -->|1. Propose Action| ProposedAction
    end

    subgraph AgentGuard_Gateway["AgentGuard Security Gateway (FastAPI Backend)"]
        TriageEngine["Triage & Sanitizer\n(<1ms Regex & Schema Validation)"]
        
        subgraph Moss_Engine["Moss In-Memory Semantic Engine"]
            PolicyIndex[("Policy Index\n(RBAC, Boundaries, Limits)")]
            IncidentIndex[("Incident Memory\n(Past Attacks & Precedents)")]
        end

        FastPath["Fast-Path Decision Engine\n(<1.5ms Deterministic Rules)"]
        Arbiter["Optional Semantic Arbiter\n(Edge-case reasoning fallback)"]
        VerdictRouter{Verdict Router}
        AuditDB[("Audit Store\nSQLite WAL")]
    end

    subgraph Operations_Console["Security Operations Console (Next.js 16 + Tailwind CSS)"]
        LiveWS["Live WebSocket Stream\n(ACTION_EVALUATED, APPROVAL_RESOLVED)"]
        ApprovalQueue["HITL Approval Queue\n(Approve / Reject with Notes)"]
        SecOpsUI["Monitoring Dashboard\n(Latency P50/P95/P99, Interceptions, Policies)"]
    end

    subgraph Destination["Execution Destination"]
        ExecuteTool["Execute Target Tool API\n(e.g. Stripe v1, DB Engine)"]
        BlockAction["Execution Prevented\n(Drop Action & Raise SecurityException)"]
    end

    ProposedAction -->|POST /api/v1/guard/evaluate| TriageEngine
    TriageEngine -->|2. In-Process Retrieval <5ms| Moss_Engine
    PolicyIndex -->|Matched Policies| FastPath
    IncidentIndex -->|Historical Incidents| FastPath

    FastPath -->|Unambiguous Verdict| VerdictRouter
    FastPath -.->|Ambiguous Intent| Arbiter
    Arbiter -.-> VerdictRouter

    VerdictRouter -->|ALLOW (<10ms)| ExecuteTool
    VerdictRouter -->|BLOCK (<10ms)| BlockAction
    VerdictRouter -->|REQUIRE_APPROVAL| ApprovalQueue

    VerdictRouter -->|Broadcast Event| LiveWS
    VerdictRouter -->|Record Audit Log| AuditDB
    ApprovalQueue -->|Supervisor Verdict| VerdictRouter
    VerdictRouter -->|Resume Execution on Approve| ExecuteTool
```

---

## 3. Latency Budget & Benchmark Methodology

AgentGuard is architected from the ground up for strict, measurable latency budgets:

| Stage | Measured Latency | Technology / Mechanism | Description |
| :--- | :--- | :--- | :--- |
| **1. Ingestion & Pre-check** | **0.2 – 0.5 ms** | FastAPI + Pydantic v2 | Payload deserialization, schema validation, regex syntax checks |
| **2. Moss Retrieval** | **0.1 – 2.0 ms** | Moss In-Memory Runtime | Local hybrid search (vector + BM25) across Policy & Incident indexes |
| **3. Fast-Path Evaluation** | **0.1 – 0.5 ms** | Python Native Rule Engine | Threshold checks (limits, roles, explicit blocks, exact parameter bounds) |
| **4. Telemetry & Response** | **0.1 – 0.3 ms** | Non-blocking AsyncIO | Async broadcast to WebSocket queue, return HTTP response |
| **Total Gateway Latency** | **0.5 – 3.5 ms** | **Sub-10ms Guarantee** | **Full security gate completed with zero user-noticeable lag** |
| *5. Semantic Arbiter (Optional)* | *100 – 200 ms* | Gemini Flash / Groq | Only invoked if policies explicitly require natural-language intent reasoning |

### Benchmark Methodology & Metric Definitions
AgentGuard separates and measures three distinct latency tiers:
1. **Native Moss Latency (`native_moss`):** Measures the raw in-process C/Rust vector and BM25 index query execution time (typically 0.1ms to 1.8ms).
2. **Moss Retrieval Latency (`moss_retrieval`):** Measures the wall-clock execution of the async Python retrieval provider wrapper.
3. **Total AgentGuard Pipeline Latency (`total_pipeline`):** Measures the complete end-to-end security gate (request deserialization + pre-triage regex checks + Moss policy retrieval + deterministic rule evaluation + verdict decision routing).
4. **Downstream Execution Separation:** Downstream tool executions (e.g. calling external Stripe APIs or executing database mutations) occur *after* the gateway produces an ALLOW verdict and are measured separately as `execution_time_ms`.

---

## 4. Key Features & Architectural Highlights

- **Sub-10ms Gate:** Intercepts proposed actions before execution and evaluates them against active policies in under 10ms.
- **Dual-Tier Decision Engine:** High-speed regex and schema pre-triage paired with Moss in-process vector retrieval.
- **Human-in-the-Loop (HITL) Approvals:** Automatically suspends high-risk mutations (e.g., Stripe refunds > \$1,000) and resumes downstream tool execution only when approved by a human reviewer.
- **Race-Condition Safe Concurrency:** Database-level atomic state transitions (`WHERE approval_id = ? AND status = 'PENDING'`) guarantee that concurrent requests can never result in duplicate tool executions or double refunds.
- **Enterprise SQLite Database Management:**
  - WAL journal mode (`PRAGMA journal_mode = WAL;`) and 5,000ms busy timeout (`PRAGMA busy_timeout = 5000;`) for high concurrent read/write throughput.
  - Formal, deterministic schema migrations tracking version history in `schema_migrations`.
  - Composite indexes on `approvals(status, created_at DESC)` and `audit_logs(timestamp DESC, verdict)`.
  - Online hot backups via SQLite native backup API (`POST /api/v1/system/backup`).
  - Automated audit retention pruning (`POST /api/v1/system/prune`).
- **Full-Stack SecOps Console:** Dark orange themed Next.js 16 + Tailwind CSS console with live WebSocket event streaming, React Error Boundaries, full accessibility (ARIA roles, dialog modals, keyboard navigation), policy configuration, audit trails, and agent registry.
- **Attack Simulator:** Interactive playground testing official demo scenarios (Calendar ALLOW, SQL DROP BLOCK, High-Value Refund REQUIRE_APPROVAL).
- **Enterprise Configuration & Secrets:** `pydantic-settings` architecture with pluggable providers for HashiCorp Vault, AWS Secrets Manager, and GCP Secret Manager with automatic secret masking.
- **CI/CD & Containerization:** Production Dockerfiles, `docker-compose.yml`, optional Nginx reverse proxy with WebSocket upgrade headers (`docker-compose.prod.yml`), and GitHub Actions workflow.

---

## 5. Threat Model & Security Boundaries

AgentGuard provides deterministic, defense-in-depth protection for agentic tool execution pipelines:

### Protected Threats
* **Unauthorized Financial Operations:** High-value payouts, refunds, and wire transfers exceeding role thresholds are trapped in the HITL approval queue.
* **Destructive Infrastructure & DB Mutations:** Direct `DROP TABLE`, `TRUNCATE`, `rm -rf`, or unauthorized IAM role updates are blocked at the pre-triage and semantic policy layer.
* **Prompt Injections & Jailbreaks:** Indirect prompt injections in tool arguments attempting to bypass guardrails are blocked via signature matching and negative incident vector retrieval.
* **Privilege Escalation:** Agents with low-privilege roles attempting administrative actions are detected and blocked before dispatch.

### Assumptions & Operational Boundaries
* **Gateway Position:** AgentGuard is designed as an inline security gateway. Autonomous agents must be configured to route tool proposals through `POST /api/v1/guard/evaluate` or use the AgentGuard execution wrapper. Direct out-of-band calls bypassing the gateway are not intercepted.
* **Multi-Node Database Scaling:** The embedded SQLite database utilizes WAL mode with atomic transactions and busy timeout handling for single-node deployments. For multi-node distributed clusters, point `SQLITE_DB_PATH` to a shared persistent volume with LiteFS/Litestream or migrate to a networked datastore.

---

## 5. Quickstart

### Option A: 1-Command Docker Compose (Recommended)

Run the entire AgentGuard stack (FastAPI backend + Next.js console + persistent SQLite storage) with a single command:

```bash
git clone https://github.com/Jeytex/AgentGuard.git
cd AgentGuard

# Start both services
docker compose up --build
```

- **Backend API & Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Frontend Console:** [http://localhost:3000](http://localhost:3000)
- **Healthcheck:** [http://localhost:8000/health](http://localhost:8000/health)

---

### Option B: Local Development

#### Prerequisites
- **Python 3.12+**
- **Node.js 20+ & npm**

#### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Run FastAPI backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend starts at `http://localhost:8000`. Seed policies are seeded automatically on first run.

#### 2. Frontend Setup

```bash
cd UI

# Install dependencies
npm ci

# Configure environment
cp .env.example .env.local

# Start Next.js development server
npm run dev
```

The frontend console starts at `http://localhost:3000`.

---

### Option C: Cloud Deployment (Render & Vercel)

#### Backend Deployment on Render

AgentGuard's backend is packaged with a security-hardened Dockerfile executing as an unprivileged user (`agentguard:1000`).

1. **Create Web Service on Render:**
   - Connect repository `AgentGuard`.
   - **Root Directory:** leave blank (repository root) or `backend`.
   - **Runtime:** `Docker` (Render will build `backend/Dockerfile` or root).
2. **Configure Environment Variables:**
   - `MOSS_PROJECT_ID`: your Moss Project ID.
   - `MOSS_PROJECT_KEY`: your Moss Project API key.
   - `MOSS_MOCK_FALLBACK`: `false` (or `true` if evaluating without live credentials).
   - `ENVIRONMENT`: `production`
   - `DEBUG`: `false`
   - `CORS_ORIGINS`: `https://<your-app>.vercel.app` (or comma-separated list).
3. **Database Storage Configuration (`SQLITE_DB_PATH`):**
   - **Render Free Tier (Ephemeral Storage):**
     - Set `SQLITE_DB_PATH=/tmp/agentguard.db`.
     - *Why:* Render Free instances run without persistent disk mounts. `/tmp` is guaranteed writable by unprivileged container users. Even if `/var/data/agentguard.db` is accidentally specified, AgentGuard automatically detects the uncreatable parent directory and safely falls back to `/tmp/agentguard.db` without crashing.
   - **Render Paid Tier (Persistent Storage):**
     - Add a persistent disk in Render service settings mounted at `/var/data` (e.g. 1GB disk).
     - Set `SQLITE_DB_PATH=/var/data/agentguard.db`.

#### Frontend Deployment on Vercel

1. Import repository `AgentGuard` into Vercel.
2. Set **Root Directory** to `UI`.
3. Framework Preset: **Next.js**.
4. Configure Environment Variables:
   - `NEXT_PUBLIC_AGENTGUARD_API_URL`: `https://<your-render-backend>.onrender.com/api/v1`
   - `NEXT_PUBLIC_AGENTGUARD_WS_URL`: `wss://<your-render-backend>.onrender.com/api/v1/events/ws`

---

## 6. Configuration & Secrets Management

AgentGuard uses `pydantic-settings` to provide strongly-typed configuration, validation on startup, and dynamic secret resolution.

### Backend Environment Variables (`backend/.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `SECRET_PROVIDER` | string | `env` | Secret backend: `env`, `vault`, `aws`, or `gcp` |
| `MOSS_PROJECT_ID` | string | `""` | Moss Project ID (from https://moss.dev) |
| `MOSS_PROJECT_KEY` | string | `""` | Moss Project API Key |
| `MOSS_MOCK_FALLBACK` | boolean | `true` | Enables in-memory mock when offline or testing |
| `HOST` | string | `0.0.0.0` | API bind address |
| `PORT` | integer | `8000` | API port |
| `CORS_ORIGINS` | string | `*` | Allowed CORS origins (comma-separated or `*`) |
| `SQLITE_DB_PATH` | string | `agentguard.db` | Path to SQLite DB (`/tmp/agentguard.db` on Render Free ephemeral; `/var/data/agentguard.db` on persistent disk) |
| `GEMINI_API_KEY` | string | `""` | Optional LLM arbiter API key |
| `VAULT_ADDR` | string | `""` | HashiCorp Vault URL (if `SECRET_PROVIDER=vault`) |
| `VAULT_TOKEN` | string | `""` | HashiCorp Vault authentication token |
| `VAULT_PATH` | string | `secret/data/agentguard` | Path to Vault secret engine |
| `AWS_REGION` | string | `us-east-1` | AWS region (if `SECRET_PROVIDER=aws`) |
| `AWS_SECRET_ID` | string | `agentguard/production`| AWS Secrets Manager secret ID |
| `GCP_PROJECT_ID` | string | `""` | GCP Project ID (if `SECRET_PROVIDER=gcp`) |

### Frontend Environment Variables (`UI/.env.local`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_AGENTGUARD_API_URL` | string | `http://localhost:8000/api/v1` | REST API base endpoint |
| `NEXT_PUBLIC_AGENTGUARD_WS_URL` | string | `ws://localhost:8000/api/v1/events/ws` | WebSocket event stream endpoint |

### Enterprise Secret Manager Integration

To avoid storing credentials in plaintext on disk in production, set `SECRET_PROVIDER` to `vault`, `aws`, or `gcp`:

```bash
# HashiCorp Vault Example
SECRET_PROVIDER=vault
VAULT_ADDR=https://vault.internal:8200
VAULT_TOKEN=s.exampleToken12345
VAULT_PATH=secret/data/agentguard
```

On startup, AgentGuard dynamically queries Vault for `MOSS_PROJECT_KEY`, `MOSS_PROJECT_ID`, and `GEMINI_API_KEY`, masks sensitive keys in diagnostic logs, and falls back to environment variables gracefully if the secret manager is unavailable.

---

## 7. API Usage & Reference

### Evaluate Proposed Action

**`POST /api/v1/guard/evaluate`**

Evaluates an action before it is executed.

```bash
curl -X POST http://localhost:8000/api/v1/guard/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "support-agent-01",
    "agent_role": "tier_1_support",
    "tool_name": "stripe_refund",
    "parameters": {
      "customer_id": "cus_99",
      "amount": 2500,
      "reason": "late_delivery"
    }
  }'
```

**Response (Sub-10ms):**
```json
{
  "action_id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "verdict": "REQUIRE_APPROVAL",
  "risk_level": "HIGH",
  "risk_score": 75,
  "reason": "Approval required: Refund amount ($2500.0) exceeds auto-approval threshold of $1,000 (Financial Threshold Policy).",
  "matched_policies": [
    {
      "policy_id": "pol_fin_01",
      "category": "financial",
      "rule_text": "Refunds exceeding $1,000 must be routed to human supervisor.",
      "score": 0.92,
      "enforcement": "REQUIRE_APPROVAL",
      "reason": "Refund amount exceeds limit"
    }
  ],
  "approval_id": "appr_7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "latency": {
    "moss_retrieval_ms": 3.82,
    "rule_evaluation_ms": 0.88,
    "total_latency_ms": 5.42
  },
  "timestamp": "2026-09-18T01:00:00.000Z"
}
```

---

### Human-in-the-Loop Approvals

**`GET /api/v1/approvals/pending`**  
List pending approval requests awaiting human review.

**`POST /api/v1/approvals/{approval_id}/decide`**  
Approve or reject a pending action. If approved, the Tool Executor automatically executes the real tool API.

```bash
curl -X POST http://localhost:8000/api/v1/approvals/appr_7c9e.../decide \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "APPROVE",
    "reviewed_by": "sec_director_alice",
    "reviewer_notes": "Verified against enterprise VIP contract terms."
  }'
```

---

### Attack Simulator

**`POST /api/v1/simulator/run`**  
Executes official security scenarios:
- `calendar_schedule`: ALLOW flow → Tool Executor executes `get_user_calendar`
- `sql_drop_table`: BLOCK flow → Execution prevented, destructive SQL dropped
- `excessive_refund`: REQUIRE_APPROVAL flow → Tool execution paused pending human review

```bash
curl -X POST http://localhost:8000/api/v1/simulator/run \
  -H "Content-Type: application/json" \
  -d '{"scenario_id": "sql_drop_table"}'
```

---

### Real-Time WebSocket Stream

**`ws://localhost:8000/api/v1/events/ws`**

Subscribes to live gateway activity without polling.

**Event Types:**
- `ACTION_EVALUATED`: Real-time notification when any action is evaluated.
- `APPROVAL_RESOLVED`: Live broadcast when an approval is approved or rejected by a supervisor.
- `AGENT_STATUS`: Agent health and telemetry heartbeats.
- `PING` / `PONG`: Keepalive connection management.

---

## 8. Testing & Code Quality

AgentGuard maintains a comprehensive automated test suite with **100% pass rate across 55 regression tests**:

```bash
cd backend

# Run the complete test suite
pytest tests -v

# Run linting with Ruff
ruff check app tests
```

### Frontend Typecheck & Build

```bash
cd UI

# Validate TypeScript
npx tsc --noEmit

# Build production Next.js bundle
npm run build
```

---

## 9. CI/CD Pipeline

Every commit and pull request to `main` automatically triggers GitHub Actions (`.github/workflows/ci.yml`):

1. **`backend-ci`:** Sets up Python 3.12, installs dependencies, runs Ruff linting, and runs all 55 Pytest tests.
2. **`frontend-ci`:** Sets up Node.js 20, runs TypeScript type verification, and compiles the Next.js production build.
3. **`docker-validation`:** Validates `docker-compose.yml` config and builds both backend and UI Docker containers.
4. **`security-scan`:** Scans tracked files to guarantee zero leaked credentials, keys, or database files.

---

## 10. Repository Structure

```text
AgentGuard/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI/CD pipeline
├── backend/
│   ├── app/
│   │   ├── api/routes.py      # REST & WebSocket API endpoints
│   │   ├── config.py          # pydantic-settings configuration
│   │   ├── data/              # Seed policies & simulation scenarios
│   │   ├── engine/            # Guard engine, approvals, executor, models
│   │   ├── retrieval/         # Moss in-memory client & provider
│   │   ├── secrets/           # Pluggable Vault/AWS/GCP secret providers
│   │   └── main.py            # FastAPI entrypoint & lifecycle
│   ├── tests/                 # 55 automated integration & unit tests
│   ├── Dockerfile             # Multi-stage Python 3.12 Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt
│   └── ruff.toml              # Ruff linter configuration
├── UI/
│   ├── app/
│   │   ├── components/        # Header, Sidebar, Drawers, Modals, Badges
│   │   ├── views/             # Overview, Interceptions, Approvals, Policies, etc.
│   │   ├── services/api.ts    # REST API client
│   │   ├── hooks/             # WebSocket real-time subscription hook
│   │   └── types.ts           # TypeScript models matching backend contracts
│   ├── public/                # Static assets
│   ├── Dockerfile             # Multi-stage Next.js Dockerfile
│   ├── .dockerignore
│   └── package.json
├── docker-compose.yml         # Single-command full stack orchestration
├── .dockerignore
├── .gitignore
├── api_spec.md                # Full OpenAPI/REST specifications
├── architecture.md            # System architecture document
└── README.md                  # Main enterprise documentation
```

---

## 11. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
