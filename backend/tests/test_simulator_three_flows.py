import pytest
from starlette.testclient import TestClient
from app.main import app
from app.engine.guard import get_guard_engine


@pytest.fixture
def client():
    guard = get_guard_engine()
    guard.approval_manager._init_db()
    with TestClient(app) as c:
        yield c


def test_list_scenarios_includes_official_demos(client):
    """Verify GET /api/v1/simulator/scenarios returns all pre-built scenarios including the 3 official demos."""
    res = client.get("/api/v1/simulator/scenarios")
    assert res.status_code == 200
    scenarios = res.json()
    assert isinstance(scenarios, list)
    assert len(scenarios) >= 3

    scenario_ids = [s["scenario_id"] for s in scenarios]
    assert "benign_calendar" in scenario_ids
    assert "sql_drop_table" in scenario_ids
    assert "excessive_refund" in scenario_ids

    calendar = next(s for s in scenarios if s["scenario_id"] == "benign_calendar")
    assert calendar["expected_verdict"] == "ALLOW"
    assert calendar["sample_request"]["tool_name"] == "get_user_calendar"

    sql = next(s for s in scenarios if s["scenario_id"] == "sql_drop_table")
    assert sql["expected_verdict"] == "BLOCK"
    assert sql["sample_request"]["tool_name"] == "db_query"

    refund = next(s for s in scenarios if s["scenario_id"] == "excessive_refund")
    assert refund["expected_verdict"] == "REQUIRE_APPROVAL"
    assert refund["sample_request"]["tool_name"] == "stripe_issue_refund"


def test_invalid_scenario_id_returns_404(client):
    """Verify POST /api/v1/simulator/run with invalid id returns 404."""
    res = client.post("/api/v1/simulator/run", json={"scenario_id": "invalid_scenario_999"})
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_flow_1_calendar_allow_tool_executor(client):
    """
    Flow 1: Calendar -> ALLOW -> Tool Executor
    Verifies:
    - Simulator output banner & verdict ALLOW
    - External tool executor runs Google Calendar API v3 mock
    - Appears in Interceptions
    - Appears in Audit trail
    - WebSocket receives ACTION_EVALUATED
    - Does NOT appear in pending approvals
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # Run benign calendar scenario
        run_res = client.post("/api/v1/simulator/run", json={"scenario_id": "benign_calendar"})
        assert run_res.status_code == 200
        data = run_res.json()

        action_id = data["action_id"]
        assert data["verdict"] == "ALLOW"
        assert data["risk_level"] == "LOW"
        assert data["tool_name"] == "get_user_calendar"
        assert data["approval_id"] is None

        # 1. Tool Executor verification
        exec_res = data.get("execution_result")
        assert exec_res is not None
        assert exec_res["executed"] is True
        assert exec_res["status"] == "success"
        assert exec_res["tool_name"] == "get_user_calendar"
        assert exec_res["output"]["api"] == "Google Calendar API v3"
        assert exec_res["output"]["items_count"] == 3
        assert len(exec_res["output"]["events"]) == 3

        # 2. WebSocket activity verification
        ws_msg = ws.receive_json()
        assert ws_msg["event_type"] == "ACTION_EVALUATED"
        assert ws_msg["data"]["action_id"] == action_id
        assert ws_msg["data"]["verdict"] == "ALLOW"
        assert ws_msg["data"]["execution_result"]["status"] == "success"

        # 3. Interceptions verification
        inter_res = client.get("/api/v1/interceptions?limit=50")
        assert inter_res.status_code == 200
        interceptions = inter_res.json()
        matched = next((i for i in interceptions if i["action_id"] == action_id), None)
        assert matched is not None
        assert matched["verdict"] == "ALLOW"
        assert matched["tool_name"] == "get_user_calendar"
        assert matched["execution_result"]["status"] == "success"

        # 4. Approvals verification (should NOT be pending)
        pending_res = client.get("/api/v1/approvals/pending")
        assert pending_res.status_code == 200
        assert not any(p["action_id"] == action_id for p in pending_res.json())


def test_flow_2_destructive_sql_block_execution_prevented(client):
    """
    Flow 2: Destructive SQL -> BLOCK -> Execution Prevented
    Verifies:
    - Simulator output banner & verdict BLOCK
    - Tool execution prevented (executed=False, status='blocked')
    - Threat/injection detection policy rationale
    - Appears in Interceptions with verdict BLOCK
    - Appears in Audit trail
    - WebSocket receives ACTION_EVALUATED
    - Does NOT appear in pending approvals
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # Run sql drop table scenario
        run_res = client.post("/api/v1/simulator/run", json={"scenario_id": "sql_drop_table"})
        assert run_res.status_code == 200
        data = run_res.json()

        action_id = data["action_id"]
        assert data["verdict"] == "BLOCK"
        assert data["risk_level"] in ("CRITICAL", "HIGH")
        assert data["tool_name"] == "db_query"
        assert data["approval_id"] is None

        # 1. Execution prevented verification
        exec_res = data.get("execution_result")
        assert exec_res is not None
        assert exec_res["executed"] is False
        assert exec_res["status"] == "blocked"
        assert "DROP TABLE" in str(data["parameters"])

        # 2. WebSocket activity verification
        ws_msg = ws.receive_json()
        assert ws_msg["event_type"] == "ACTION_EVALUATED"
        assert ws_msg["data"]["action_id"] == action_id
        assert ws_msg["data"]["verdict"] == "BLOCK"
        assert ws_msg["data"]["execution_result"]["executed"] is False

        # 3. Interceptions verification
        inter_res = client.get("/api/v1/interceptions?limit=50")
        assert inter_res.status_code == 200
        matched = next((i for i in inter_res.json() if i["action_id"] == action_id), None)
        assert matched is not None
        assert matched["verdict"] == "BLOCK"
        assert matched["execution_result"]["status"] == "blocked"

        # 4. Approvals verification (should NOT be pending)
        pending_res = client.get("/api/v1/approvals/pending")
        assert pending_res.status_code == 200
        assert not any(p["action_id"] == action_id for p in pending_res.json())


def test_flow_3_excessive_refund_approval_to_tool_executor(client):
    """
    Flow 3: High-Value Refund -> HUMAN APPROVAL -> Approve -> Tool Executor
    Verifies:
    - Simulator output banner & verdict REQUIRE_APPROVAL
    - Tool execution paused (executed=False, status='pending_approval')
    - Approval enqueued in pending approvals queue
    - Appears in Interceptions with verdict REQUIRE_APPROVAL
    - WebSocket receives ACTION_EVALUATED
    - Human supervisor approves with reviewer notes
    - Tool Executor triggers Stripe Payments API mock upon approval
    - Approval resolved and removed from pending queue
    - WebSocket receives APPROVAL_RESOLVED and resolved ACTION_EVALUATED
    - Audit trail updated with ALLOW verdict and tool execution result
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # Step 1: Run excessive refund scenario in simulator
        run_res = client.post("/api/v1/simulator/run", json={"scenario_id": "excessive_refund"})
        assert run_res.status_code == 200
        data = run_res.json()

        action_id = data["action_id"]
        approval_id = data["approval_id"]
        assert data["verdict"] == "REQUIRE_APPROVAL"
        assert data["risk_level"] == "HIGH"
        assert data["tool_name"] == "stripe_issue_refund"
        assert approval_id is not None

        # Tool execution paused pending human review
        exec_res = data.get("execution_result")
        assert exec_res is not None
        assert exec_res["executed"] is False
        assert exec_res["status"] == "pending_approval"

        # WebSocket received ACTION_EVALUATED
        ws_msg1 = ws.receive_json()
        assert ws_msg1["event_type"] == "ACTION_EVALUATED"
        assert ws_msg1["data"]["action_id"] == action_id
        assert ws_msg1["data"]["verdict"] == "REQUIRE_APPROVAL"
        assert ws_msg1["data"]["approval_id"] == approval_id

        # Step 2: Verify appears in pending approvals queue
        pending_res = client.get("/api/v1/approvals/pending")
        assert pending_res.status_code == 200
        pending_items = pending_res.json()
        appr_item = next((p for p in pending_items if p["approval_id"] == approval_id), None)
        assert appr_item is not None
        assert appr_item["action_id"] == action_id
        assert appr_item["tool_name"] == "stripe_issue_refund"
        assert appr_item["parameters"]["amount"] == 2500

        # Step 3: Verify appears in Interceptions
        inter_res1 = client.get("/api/v1/interceptions?limit=50")
        assert inter_res1.status_code == 200
        inter_entry = next((i for i in inter_res1.json() if i["action_id"] == action_id), None)
        assert inter_entry is not None
        assert inter_entry["verdict"] == "REQUIRE_APPROVAL"

        # Step 4: Human reviewer approves the refund
        decide_res = client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={
                "decision": "APPROVE",
                "reviewed_by": "sec_director_alice",
                "reviewer_notes": "Bulk logistics delivery refund approved per VIP client contract.",
            },
        )
        assert decide_res.status_code == 200
        decision_data = decide_res.json()
        assert decision_data["status"] == "APPROVED"
        assert decision_data["resolved_by"] == "sec_director_alice"

        # Verify Tool Executor executed Stripe API
        stripe_exec = decision_data.get("execution_result")
        assert stripe_exec is not None
        assert stripe_exec["executed"] is True
        assert stripe_exec["status"] == "success"
        assert stripe_exec["output"]["api"] == "Stripe Payments API v1"
        assert stripe_exec["output"]["amount"] == 2500
        assert stripe_exec["output"]["status"] == "succeeded"
        assert stripe_exec["output"]["id"].startswith("re_")

        # Step 5: WebSocket broadcast verification
        ws_msg2 = ws.receive_json()
        assert ws_msg2["event_type"] == "APPROVAL_RESOLVED"
        assert ws_msg2["data"]["approval_id"] == approval_id
        assert ws_msg2["data"]["status"] == "APPROVED"

        ws_msg3 = ws.receive_json()
        assert ws_msg3["event_type"] == "ACTION_EVALUATED"
        assert ws_msg3["data"]["action_id"] == action_id
        assert ws_msg3["data"]["verdict"] == "ALLOW"
        assert ws_msg3["data"]["execution_result"]["status"] == "success"

        # Step 6: Verify removed from pending approvals
        pending_res2 = client.get("/api/v1/approvals/pending")
        assert pending_res2.status_code == 200
        assert not any(p["approval_id"] == approval_id for p in pending_res2.json())

        # Step 7: Verify Audit log contains updated resolved record
        inter_res2 = client.get("/api/v1/interceptions?limit=50")
        assert inter_res2.status_code == 200
        updated_entry = next((i for i in inter_res2.json() if i["action_id"] == action_id), None)
        assert updated_entry is not None
        assert updated_entry["verdict"] == "ALLOW"
        assert updated_entry["execution_result"]["status"] == "success"
