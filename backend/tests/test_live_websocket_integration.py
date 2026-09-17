"""
Test and verify live WebSocket events broadcasting from FastAPI gateway
to real-time connected frontend clients.
"""
import pytest
import json
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_websocket_ping_keepalive(client):
    """Verify that keep-alive ping returns typed PONG payload."""
    with client.websocket_connect("/api/v1/events/ws") as ws:
        ws.send_text("ping")
        message = ws.receive_text()
        payload = json.loads(message)
        assert payload["event_type"] == "PONG"


def test_websocket_live_action_evaluated(client):
    """
    Verify that when an action is evaluated via POST /guard/evaluate,
    connected WebSocket clients immediately receive the typed ACTION_EVALUATED
    payload without refreshing.
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # Trigger an action
        action_payload = {
            "agent_id": "ws-live-agent",
            "agent_role": "tier_1_support",
            "tool_name": "stripe_issue_refund",
            "parameters": {"amount": 3500, "customer_id": "cust_live_ws"},
            "context": "Customer requested urgent refund for broken shipment.",
            "dry_run": False,
        }
        res = client.post("/api/v1/guard/evaluate", json=action_payload)
        assert res.status_code == 200
        action_data = res.json()
        assert action_data["verdict"] == "REQUIRE_APPROVAL"
        action_id = action_data["action_id"]
        approval_id = action_data["approval_id"]
        assert approval_id is not None

        # Verify WebSocket received the broadcasted event
        ws_msg = ws.receive_text()
        ws_payload = json.loads(ws_msg)
        assert ws_payload["event_type"] == "ACTION_EVALUATED"
        assert ws_payload["data"]["action_id"] == action_id
        assert ws_payload["data"]["verdict"] == "REQUIRE_APPROVAL"
        assert ws_payload["data"]["tool_name"] == "stripe_issue_refund"
        assert ws_payload["data"]["approval_id"] == approval_id
        assert "latency" in ws_payload["data"]
        assert "moss_retrieval_ms" in ws_payload["data"]["latency"]


def test_websocket_live_approval_resolved(client):
    """
    Verify that when a human supervisor approves/rejects an action,
    connected WebSocket clients receive typed APPROVAL_RESOLVED.
    """
    with client.websocket_connect("/api/v1/events/ws") as ws:
        # 1. Trigger action that pauses for approval
        eval_res = client.post(
            "/api/v1/guard/evaluate",
            json={
                "agent_id": "supervisor-test-agent",
                "agent_role": "tier_1_support",
                "tool_name": "stripe_issue_refund",
                "parameters": {"amount": 2500, "customer_id": "cust_super"},
                "dry_run": False,
            },
        )
        assert eval_res.status_code == 200
        appr_id = eval_res.json()["approval_id"]
        assert appr_id is not None

        # Drain the ACTION_EVALUATED event from WS
        ws.receive_text()

        # 2. Decide approval via REST
        decide_res = client.post(
            f"/api/v1/approvals/{appr_id}/decide",
            json={
                "decision": "APPROVE",
                "reviewed_by": "security-lead@agentguard.dev",
                "reviewer_notes": "Live supervisor authorization via console",
            },
        )
        assert decide_res.status_code == 200

        # 3. Verify WebSocket received APPROVAL_RESOLVED
        ws_msg = ws.receive_text()
        ws_payload = json.loads(ws_msg)
        assert ws_payload["event_type"] == "APPROVAL_RESOLVED"
        assert ws_payload["data"]["approval_id"] == appr_id
        assert ws_payload["data"]["status"] == "APPROVED"
        assert ws_payload["data"]["resolved_by"] == "security-lead@agentguard.dev"
