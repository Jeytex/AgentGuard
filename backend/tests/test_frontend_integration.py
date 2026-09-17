"""
End-to-end verification of all REST endpoints and WebSocket events
consumed by the Next.js frontend console.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_overview_endpoints(client):
    # Health endpoint used by Header, Sidebar, and Overview metrics
    health_res = client.get("/api/v1/health")
    assert health_res.status_code == 200
    h_data = health_res.json()
    assert "status" in h_data
    assert "moss_connected" in h_data
    assert "total_policies_indexed" in h_data
    assert h_data["total_policies_indexed"] > 0

    # Interceptions endpoint used by Overview live activity & Interceptions view
    inter_res = client.get("/api/v1/interceptions?limit=50")
    assert inter_res.status_code == 200
    inter_data = inter_res.json()
    assert isinstance(inter_data, list)


def test_interceptions_and_audit_endpoints(client):
    # Trigger an action
    action_payload = {
        "agent_id": "audit-tester",
        "agent_role": "tier_1_support",
        "tool_name": "get_user_calendar",
        "parameters": {"date": "2026-09-17"},
        "dry_run": False,
    }
    eval_res = client.post("/api/v1/guard/evaluate", json=action_payload)
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    assert eval_data["verdict"] == "ALLOW"
    action_id = eval_data["action_id"]

    # Verify audit log includes this action
    audit_res = client.get("/api/v1/interceptions?limit=50")
    assert audit_res.status_code == 200
    records = audit_res.json()
    found = any(r["action_id"] == action_id for r in records)
    assert found is True


def test_approvals_lifecycle_endpoints(client):
    # 1. Trigger an approval-requiring action ($4,500 refund)
    refund_payload = {
        "agent_id": "billing-bot",
        "agent_role": "tier_1_support",
        "tool_name": "stripe_issue_refund",
        "parameters": {"amount": 4500, "customer_id": "cust_high_val"},
        "context": "Customer requested large refund",
        "dry_run": False,
    }
    eval_res = client.post("/api/v1/guard/evaluate", json=refund_payload)
    assert eval_res.status_code == 200
    res_data = eval_res.json()
    assert res_data["verdict"] == "REQUIRE_APPROVAL"
    approval_id = res_data["approval_id"]
    assert approval_id is not None

    # 2. Fetch pending approvals (used by ApprovalsView)
    pending_res = client.get("/api/v1/approvals/pending")
    assert pending_res.status_code == 200
    pending_items = pending_res.json()
    assert any(p["approval_id"] == approval_id for p in pending_items)

    # 3. Decide approval (used by ActionDetailDrawer and ApprovalsView quick actions)
    decision_payload = {
        "decision": "APPROVE",
        "reviewed_by": "security-admin@agentguard.dev",
        "reviewer_notes": "One-time exception granted for testing",
    }
    decide_res = client.post(f"/api/v1/approvals/{approval_id}/decide", json=decision_payload)
    assert decide_res.status_code == 200
    decide_data = decide_res.json()
    assert decide_data["status"] == "APPROVED"
    assert decide_data["execution_result"] is not None

    # 4. Verify no longer pending
    post_res = client.get("/api/v1/approvals/pending")
    assert not any(p["approval_id"] == approval_id for p in post_res.json())


def test_policies_endpoints(client):
    # Fetch policies list
    list_res = client.get("/api/v1/policies")
    assert list_res.status_code == 200
    policies = list_res.json()
    assert len(policies) >= 10

    # Filter by category
    cat_res = client.get("/api/v1/policies?category=financial")
    assert cat_res.status_code == 200
    for p in cat_res.json():
        assert p["category"] == "financial"

    # Create new policy (used by CreatePolicyModal)
    create_payload = {
        "category": "destructive",
        "name": "Frontend Test Policy",
        "rule_text": "Disallow rm -rf operations on cloud volumes.",
        "enforcement": "BLOCK",
        "risk_level": "CRITICAL",
        "target_tools": ["bash_execute"],
        "conditions": {"blocked_keywords": ["rm -rf"]},
        "is_active": True,
    }
    create_res = client.post("/api/v1/policies", json=create_payload)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["name"] == "Frontend Test Policy"
    assert created["id"].startswith("pol_")

    # Seed policies endpoint (used by PoliciesView "Seed Policies" button)
    seed_res = client.post("/api/v1/policies/seed")
    assert seed_res.status_code == 200
    seed_data = seed_res.json()
    assert seed_data["status"] == "success"
    assert seed_data["indexed_count"] >= 14


def test_agents_endpoint(client):
    # Monitored fleet used by AgentsView
    res = client.get("/api/v1/agents")
    assert res.status_code == 200
    agents = res.json()
    assert len(agents) >= 3
    for a in agents:
        assert "agent_id" in a
        assert "role" in a
        assert "status" in a
        assert "total_actions" in a
        assert "last_action" in a
        assert "allowed_tools" in a


def test_benchmarks_endpoint(client):
    # Benchmark harness used by BenchmarksView
    res = client.post("/api/v1/benchmark", json={"iterations": 10, "warmup": 2})
    assert res.status_code == 200
    bench = res.json()
    assert bench["total_queries"] == 10
    assert "native_moss" in bench
    assert "moss_retrieval" in bench
    assert "total_pipeline" in bench
    assert "remote_vector_db" in bench
    assert bench["speedup_factor"] > 1.0


def test_simulator_endpoints(client):
    # Scenarios list used by SimulatorView presets
    scen_res = client.get("/api/v1/simulator/scenarios")
    assert scen_res.status_code == 200
    scenarios = scen_res.json()
    assert len(scenarios) >= 5

    # Run specific scenario
    run_res = client.post("/api/v1/simulator/run", json={"scenario_id": "sql_drop_table"})
    assert run_res.status_code == 200
    run_data = run_res.json()
    assert run_data["verdict"] == "BLOCK"
    assert run_data["risk_level"] == "CRITICAL"
    assert len(run_data["matched_policies"]) > 0

    # Run custom evaluate (used by SimulatorView Custom Action Tester)
    custom_res = client.post(
        "/api/v1/guard/evaluate",
        json={
            "agent_id": "custom-analyst",
            "agent_role": "junior_analyst",
            "tool_name": "db_query",
            "parameters": {"query": "SELECT * FROM public_items;"},
            "context": "User browsing items",
            "dry_run": False,
        },
    )
    assert custom_res.status_code == 200
    custom_data = custom_res.json()
    assert custom_data["verdict"] == "ALLOW"


def test_websocket_envelope(client):
    # Connect to WebSocket and verify ping / pong and event envelope shape
    with client.websocket_connect("/api/v1/events/ws") as websocket:
        websocket.send_text("ping")
        resp = websocket.receive_text()
        assert resp == '{"event_type": "PONG"}'
