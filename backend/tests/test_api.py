import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "AgentGuard"
    assert data["docs"] == "/docs"


def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["total_policies_indexed"] > 0


def test_list_policies(client):
    response = client.get("/api/v1/policies")
    assert response.status_code == 200
    policies = response.json()
    assert len(policies) >= 10


def test_evaluate_action_api(client):
    payload = {
        "agent_id": "api-test-bot",
        "agent_role": "tier_1_support",
        "tool_name": "stripe_issue_refund",
        "parameters": {"amount": 2500, "customer_id": "c_99"},
        "context": "Customer requested refund",
    }
    response = client.post("/api/v1/guard/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] == "REQUIRE_APPROVAL"
    assert "X-Moss-Retrieval-Ms" in response.headers
    assert "X-Guard-Total-Ms" in response.headers
    assert data["approval_id"] is not None


def test_simulator_scenarios(client):
    # List scenarios
    res = client.get("/api/v1/simulator/scenarios")
    assert res.status_code == 200
    scenarios = res.json()
    assert len(scenarios) >= 5

    # Run scenario
    run_res = client.post("/api/v1/simulator/run", json={"scenario_id": "sql_drop_table"})
    assert run_res.status_code == 200
    run_data = run_res.json()
    assert run_data["verdict"] == "BLOCK"
    assert run_data["risk_level"] == "CRITICAL"


def test_benchmark_api(client):
    response = client.post("/api/v1/benchmark", json={"iterations": 10, "warmup": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["total_queries"] == 10
    assert data["moss"]["mean_ms"] < 30.0
    assert data["speedup_factor"] > 5.0



def test_hitl_approval_lifecycle(client):
    # 1. Trigger action that requires approval
    payload = {
        "agent_id": "hitl-agent",
        "agent_role": "tier_1_support",
        "tool_name": "stripe_issue_refund",
        "parameters": {"amount": 3500, "customer_id": "vip_user"},
        "context": "VIP customer request",
    }
    eval_res = client.post("/api/v1/guard/evaluate", json=payload)
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    assert eval_data["verdict"] == "REQUIRE_APPROVAL"
    appr_id = eval_data["approval_id"]
    assert appr_id is not None

    # 2. Check pending approvals list
    list_res = client.get("/api/v1/approvals/pending")
    assert list_res.status_code == 200
    pending_list = list_res.json()
    assert any(p["approval_id"] == appr_id for p in pending_list)

    # 3. Submit human approval
    decide_res = client.post(
        f"/api/v1/approvals/{appr_id}/decide",
        json={
            "decision": "APPROVE",
            "reviewed_by": "lead_admin@agentguard.dev",
            "reviewer_notes": "One-time exception granted for VIP customer.",
        },
    )
    assert decide_res.status_code == 200
    decide_data = decide_res.json()
    assert decide_data["status"] == "APPROVED"
    assert decide_data["moss_memory_updated"] is True

    # 4. Ensure no longer in pending queue
    post_list_res = client.get("/api/v1/approvals/pending")
    post_pending = post_list_res.json()
    assert not any(p["approval_id"] == appr_id for p in post_pending)

