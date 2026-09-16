import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.engine.executor import ToolExecutor, get_tool_executor


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.asyncio
async def test_tool_executor_stripe_refund():
    executor = ToolExecutor()
    res = await executor.execute(
        tool_name="stripe_issue_refund",
        parameters={"amount": 450, "currency": "USD", "customer_id": "cust_123"},
    )
    assert res.executed is True
    assert res.status == "success"
    assert res.output["api"] == "Stripe Payments API v1"
    assert res.output["amount"] == 450
    assert "re_" in res.output["id"]


@pytest.mark.asyncio
async def test_tool_executor_calendar():
    executor = ToolExecutor()
    res = await executor.execute(
        tool_name="get_user_calendar",
        parameters={"date": "2026-09-17", "time_zone": "America/New_York"},
    )
    assert res.executed is True
    assert res.status == "success"
    assert res.output["items_count"] == 3
    assert len(res.output["events"]) == 3


@pytest.mark.asyncio
async def test_tool_executor_database_query():
    executor = ToolExecutor()
    res = await executor.execute(
        tool_name="db_query",
        parameters={"query": "SELECT id, status FROM accounts;", "database": "prod_replica"},
    )
    assert res.executed is True
    assert res.status == "success"
    assert len(res.output["sample_rows"]) == 4


@pytest.mark.asyncio
async def test_tool_executor_crm_export():
    executor = ToolExecutor()
    res = await executor.execute(
        tool_name="crm_export",
        parameters={"limit": 25, "format": "csv"},
    )
    assert res.executed is True
    assert res.status == "success"
    assert res.output["records_returned"] == 25


def test_full_flow_allow_executes_tool(client):
    # Benign calendar tool should be ALLOW and execute immediately
    payload = {
        "agent_id": "assistant-agent",
        "agent_role": "assistant",
        "tool_name": "get_user_calendar",
        "parameters": {"date": "2026-09-18", "time_zone": "UTC"},
        "context": "User asked for tomorrow's schedule",
    }
    response = client.post("/api/v1/guard/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["verdict"] == "ALLOW"
    assert data["execution_result"] is not None
    assert data["execution_result"]["executed"] is True
    assert data["execution_result"]["status"] == "success"
    assert data["execution_result"]["output"]["items_count"] == 3


def test_full_flow_block_does_not_execute(client):
    # Destructive SQL should be BLOCK and NOT execute
    payload = {
        "agent_id": "rogue-agent",
        "agent_role": "junior_analyst",
        "tool_name": "db_query",
        "parameters": {"query": "DROP TABLE critical_data CASCADE;"},
        "context": "Executing admin maintenance",
    }
    response = client.post("/api/v1/guard/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["verdict"] == "BLOCK"
    assert data["execution_result"] is not None
    assert data["execution_result"]["executed"] is False
    assert data["execution_result"]["status"] == "blocked"


def test_full_flow_approval_executes_on_human_approval(client):
    # 1. Action requiring approval ($1,800 refund > $1,000 limit)
    payload = {
        "agent_id": "billing-bot",
        "agent_role": "tier_1_support",
        "tool_name": "stripe_issue_refund",
        "parameters": {"amount": 1800, "customer_id": "vip_900"},
        "context": "Customer requested high value refund",
    }
    eval_res = client.post("/api/v1/guard/evaluate", json=payload)
    assert eval_res.status_code == 200
    eval_data = eval_res.json()

    assert eval_data["verdict"] == "REQUIRE_APPROVAL"
    assert eval_data["approval_id"] is not None
    assert eval_data["execution_result"]["executed"] is False
    assert eval_data["execution_result"]["status"] == "pending_approval"

    approval_id = eval_data["approval_id"]

    # 2. Human Admin approves the action
    decide_res = client.post(
        f"/api/v1/approvals/{approval_id}/decide",
        json={
            "decision": "APPROVE",
            "reviewed_by": "security-lead@agentguard.dev",
            "reviewer_notes": "Manager confirmed damaged goods exception.",
        },
    )
    assert decide_res.status_code == 200
    decide_data = decide_res.json()

    assert decide_data["status"] == "APPROVED"
    assert decide_data["execution_result"] is not None
    assert decide_data["execution_result"]["executed"] is True
    assert decide_data["execution_result"]["status"] == "success"
    assert decide_data["execution_result"]["output"]["amount"] == 1800


def test_list_interceptions_api(client):
    response = client.get("/api/v1/interceptions?limit=10")
    assert response.status_code == 200
    logs = response.json()
    assert isinstance(logs, list)
    assert len(logs) > 0
    # Check schema
    first = logs[0]
    assert "action_id" in first
    assert "verdict" in first
    assert "latency" in first


def test_list_agents_api(client):
    response = client.get("/api/v1/agents")
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) == 3
    assert any(a["agent_id"] == "support-agent" for a in agents)
    assert any(a["agent_id"] == "billing-agent" for a in agents)
    assert any(a["agent_id"] == "research-agent" for a in agents)
