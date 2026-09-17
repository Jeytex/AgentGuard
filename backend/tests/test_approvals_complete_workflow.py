"""
Complete end-to-end verification of the Approvals workflow:
- Loading pending approvals
- Approving with reviewer notes
- Rejecting with reviewer notes
- Non-existent approval 404 handling
- Already-resolved approval 400 handling
- WebSocket synchronization
- Real excessive_refund simulator scenario execution & approval completion
"""
import pytest
import json
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_loading_pending_approvals(client):
    res = client.get("/api/v1/approvals/pending")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_approve_with_reviewer_notes(client):
    # 1. Trigger action requiring approval ($3,200 refund)
    action_res = client.post(
        "/api/v1/guard/evaluate",
        json={
            "agent_id": "finance-bot-01",
            "agent_role": "tier_1_support",
            "tool_name": "stripe_issue_refund",
            "parameters": {"amount": 3200, "customer_id": "cust_vip_32"},
            "context": "Customer compensation for delayed order.",
            "dry_run": False,
        },
    )
    assert action_res.status_code == 200
    action_data = action_res.json()
    assert action_data["verdict"] == "REQUIRE_APPROVAL"
    appr_id = action_data["approval_id"]
    assert appr_id is not None

    # 2. Check it appears in pending queue
    pending_res = client.get("/api/v1/approvals/pending")
    assert any(p["approval_id"] == appr_id for p in pending_res.json())

    # 3. Submit approval decision with reviewer notes
    decide_res = client.post(
        f"/api/v1/approvals/{appr_id}/decide",
        json={
            "decision": "APPROVE",
            "reviewed_by": "security-lead@agentguard.dev",
            "reviewer_notes": "Supervisor verified transaction with VIP customer.",
        },
    )
    assert decide_res.status_code == 200
    decide_data = decide_res.json()
    assert decide_data["status"] == "APPROVED"
    assert decide_data["resolved_by"] == "security-lead@agentguard.dev"
    assert decide_data["reviewer_notes"] == "Supervisor verified transaction with VIP customer."
    assert decide_data["execution_result"] is not None
    assert decide_data["execution_result"]["executed"] is True
    assert decide_data["execution_result"]["status"] == "success"

    # 4. Check removed from pending queue
    post_pending = client.get("/api/v1/approvals/pending").json()
    assert not any(p["approval_id"] == appr_id for p in post_pending)


def test_reject_with_reviewer_notes(client):
    # 1. Trigger action requiring approval ($4,800 refund)
    action_res = client.post(
        "/api/v1/guard/evaluate",
        json={
            "agent_id": "support-agent-99",
            "agent_role": "tier_1_support",
            "tool_name": "stripe_issue_refund",
            "parameters": {"amount": 4800, "customer_id": "cust_suspicious"},
            "context": "Suspicious high-value refund request.",
            "dry_run": False,
        },
    )
    assert action_res.status_code == 200
    appr_id = action_res.json()["approval_id"]

    # 2. Reject the action with reviewer notes
    decide_res = client.post(
        f"/api/v1/approvals/{appr_id}/decide",
        json={
            "decision": "REJECT",
            "reviewed_by": "fraud-investigator@agentguard.dev",
            "reviewer_notes": "Suspected account takeover; denied.",
        },
    )
    assert decide_res.status_code == 200
    decide_data = decide_res.json()
    assert decide_data["status"] == "REJECTED"
    assert decide_data["execution_result"] is not None
    assert decide_data["execution_result"]["executed"] is False
    assert decide_data["execution_result"]["status"] == "rejected"

    # 3. Check removed from pending queue
    post_pending = client.get("/api/v1/approvals/pending").json()
    assert not any(p["approval_id"] == appr_id for p in post_pending)


def test_error_nonexistent_approval(client):
    decide_res = client.post(
        "/api/v1/approvals/appr_fake_nonexistent_uuid/decide",
        json={
            "decision": "APPROVE",
            "reviewed_by": "admin@agentguard.dev",
            "reviewer_notes": "Testing 404",
        },
    )
    assert decide_res.status_code == 404
    assert "not found" in decide_res.json()["detail"].lower()


def test_error_already_resolved_approval(client):
    # 1. Trigger and approve an action
    action_res = client.post(
        "/api/v1/guard/evaluate",
        json={
            "agent_id": "duplicate-test-agent",
            "agent_role": "tier_1_support",
            "tool_name": "stripe_issue_refund",
            "parameters": {"amount": 1500, "customer_id": "cust_dup"},
            "dry_run": False,
        },
    )
    appr_id = action_res.json()["approval_id"]

    # First resolution: OK
    res1 = client.post(
        f"/api/v1/approvals/{appr_id}/decide",
        json={"decision": "APPROVE", "reviewed_by": "first-reviewer@agentguard.dev"},
    )
    assert res1.status_code == 200

    # Second resolution: 400 Bad Request (Already Resolved)
    res2 = client.post(
        f"/api/v1/approvals/{appr_id}/decide",
        json={"decision": "REJECT", "reviewed_by": "second-reviewer@agentguard.dev"},
    )
    assert res2.status_code == 400
    assert "already been resolved as approved" in res2.json()["detail"].lower()


def test_real_high_value_refund_simulation_and_approval_workflow(client):
    """
    Execute the real preset 'excessive_refund' scenario from simulator,
    verify approval is generated, and complete it with reviewer notes.
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # Step 1: Run excessive_refund scenario through simulator
        sim_res = client.post(
            "/api/v1/simulator/run",
            json={"scenario_id": "excessive_refund"},
        )
        assert sim_res.status_code == 200
        sim_data = sim_res.json()
        assert sim_data["verdict"] == "REQUIRE_APPROVAL"
        assert sim_data["risk_level"] == "HIGH"
        assert sim_data["tool_name"] == "stripe_issue_refund"
        assert sim_data["parameters"]["amount"] == 2500
        approval_id = sim_data["approval_id"]
        assert approval_id is not None

        # Step 2: Verify WebSocket received the real-time event
        ws_msg = ws.receive_text()
        ws_payload = json.loads(ws_msg)
        assert ws_payload["event_type"] == "ACTION_EVALUATED"
        assert ws_payload["data"]["approval_id"] == approval_id

        # Step 3: Verify it is in the pending queue with matched policy pol_fin_001
        pending_res = client.get("/api/v1/approvals/pending")
        assert pending_res.status_code == 200
        pending_item = next(p for p in pending_res.json() if p["approval_id"] == approval_id)
        assert pending_item["parameters"]["amount"] == 2500
        assert any("1,000" in p["rule_text"] or "threshold" in p["reason"] for p in pending_item["matched_policies"])

        # Step 4: Complete approval with human reviewer notes
        decision_res = client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={
                "decision": "APPROVE",
                "reviewed_by": "sarah.connor@agentguard.dev",
                "reviewer_notes": "VIP customer damaged freight delivery exception confirmed via phone call.",
            },
        )
        assert decision_res.status_code == 200
        dec_data = decision_res.json()
        assert dec_data["status"] == "APPROVED"
        assert dec_data["resolved_by"] == "sarah.connor@agentguard.dev"
        assert dec_data["reviewer_notes"] == "VIP customer damaged freight delivery exception confirmed via phone call."
        assert dec_data["execution_result"]["executed"] is True
        assert dec_data["execution_result"]["status"] == "success"

        # Step 5: Verify WebSocket broadcasts APPROVAL_RESOLVED
        ws_res_msg = ws.receive_text()
        ws_res_payload = json.loads(ws_res_msg)
        assert ws_res_payload["event_type"] == "APPROVAL_RESOLVED"
        assert ws_res_payload["data"]["approval_id"] == approval_id
        assert ws_res_payload["data"]["status"] == "APPROVED"

        # Step 6: Verify removed from pending queue
        post_pending = client.get("/api/v1/approvals/pending").json()
        assert not any(p["approval_id"] == approval_id for p in post_pending)

        # Step 7: Verify final audit log records ALLOW verdict and execution result
        audit_res = client.get("/api/v1/interceptions?limit=20")
        assert audit_res.status_code == 200
        audit_item = next(a for a in audit_res.json() if a["action_id"] == sim_data["action_id"])
        assert audit_item["verdict"] == "ALLOW"
        assert "sarah.connor@agentguard.dev" in audit_item["reason"]
        assert audit_item["execution_result"]["executed"] is True
