import os
import tempfile
import sqlite3
import asyncio
from concurrent.futures import ThreadPoolExecutor
import pytest

from app.db.connection import DatabaseManager
from app.db.migrations import SchemaMigrator
from app.engine.approvals import ApprovalManager
from app.engine.models import RiskLevel


@pytest.fixture
def temp_db():
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_agentguard.db")
    yield db_path
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass


def test_database_pragmas(temp_db):
    db_mgr = DatabaseManager(temp_db)
    conn = db_mgr.create_connection()

    # Check journal_mode
    journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
    assert journal_mode.lower() == "wal"

    # Check busy_timeout
    busy_timeout = conn.execute("PRAGMA busy_timeout;").fetchone()[0]
    assert busy_timeout >= 5000

    # Check foreign_keys
    foreign_keys = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
    assert foreign_keys == 1

    conn.close()


def test_schema_migrations_and_indexes(temp_db):
    db_mgr = DatabaseManager(temp_db)
    migrator = SchemaMigrator(db_mgr)

    # 1. First run applies all migrations
    applied = migrator.run_migrations()
    assert applied >= 2

    # 2. Second run is idempotent (0 new migrations)
    applied_again = migrator.run_migrations()
    assert applied_again == 0

    # 3. Verify performance indexes exist
    conn = db_mgr.create_connection()
    approval_indexes = [row[1] for row in conn.execute("PRAGMA index_list('approvals');").fetchall()]
    audit_indexes = [row[1] for row in conn.execute("PRAGMA index_list('audit_logs');").fetchall()]

    assert "idx_approvals_status_created" in approval_indexes
    assert "idx_approvals_action_id" in approval_indexes
    assert "idx_audit_logs_timestamp" in audit_indexes
    assert "idx_audit_logs_verdict" in audit_indexes
    conn.close()


@pytest.mark.asyncio
async def test_atomic_approval_concurrency_race_condition(temp_db):
    """
    Verifies that simultaneous concurrent decision requests on the same pending approval
    are strictly idempotent: exactly one reviewer/thread succeeds and executes,
    and concurrent/duplicate requests are rejected without corrupting state.
    """
    appr_mgr = ApprovalManager(temp_db)

    # Create a pending approval
    pending = appr_mgr.create_approval(
        action_id="act_race_001",
        agent_id="test_agent",
        agent_role="support",
        tool_name="stripe_issue_refund",
        parameters={"amount": 2500},
        risk_level=RiskLevel.HIGH,
        reason="Test high-value refund race condition",
        matched_policies=[],
    )
    approval_id = pending.approval_id

    # Simulate 5 concurrent threads/reviewers deciding at the exact same moment
    num_threads = 5
    results = []

    def attempt_decision(reviewer_id: int):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                appr_mgr.decide_approval(
                    approval_id=approval_id,
                    decision="APPROVE",
                    reviewed_by=f"admin_{reviewer_id}",
                    reviewer_notes=f"Approved by thread {reviewer_id}",
                )
            )
        finally:
            loop.close()

    with ThreadPoolExecutor(max_workers=num_threads) as pool:
        futures = [pool.submit(attempt_decision, i) for i in range(num_threads)]
        results = [f.result() for f in futures]

    # Exactly ONE thread must succeed
    successful_decisions = [r for r in results if r is not None]
    failed_decisions = [r for r in results if r is None]

    assert len(successful_decisions) == 1, f"Expected exactly 1 success, got {len(successful_decisions)}"
    assert len(failed_decisions) == num_threads - 1

    # Verify database state is APPROVED
    final = appr_mgr.get_approval_by_id(approval_id)
    assert final is not None
    assert final.status == "APPROVED"


def test_online_hot_backup(temp_db):
    appr_mgr = ApprovalManager(temp_db)

    # Insert test record
    appr_mgr.record_audit(
        action_id="act_backup_001",
        agent_id="agent_backup",
        agent_role="admin",
        tool_name="test_tool",
        parameters={"test": True},
        verdict="ALLOW",
        risk_level="LOW",
        risk_score=10,
        reason="Backup verification record",
        moss_retrieval_ms=1.5,
        total_latency_ms=2.0,
    )

    backup_path = temp_db + ".backup"
    success = appr_mgr.backup_database(backup_path)
    assert success is True
    assert os.path.exists(backup_path)

    # Verify backup database has the record
    backup_conn = sqlite3.connect(backup_path)
    row = backup_conn.execute("SELECT * FROM audit_logs WHERE action_id = 'act_backup_001';").fetchone()
    assert row is not None
    backup_conn.close()

    if os.path.exists(backup_path):
        os.remove(backup_path)


def test_audit_retention_pruning(temp_db):
    appr_mgr = ApprovalManager(temp_db)

    # Record 10 audit logs
    for i in range(10):
        appr_mgr.record_audit(
            action_id=f"act_prune_{i}",
            agent_id="agent_prune",
            agent_role="admin",
            tool_name="test_tool",
            parameters={"idx": i},
            verdict="ALLOW",
            risk_level="LOW",
            risk_score=5,
            reason=f"Record {i}",
            moss_retrieval_ms=1.0,
            total_latency_ms=1.5,
        )

    # Prune keeping max 5 records
    deleted = appr_mgr.prune_audit_logs(days_to_keep=90, max_records=5)
    assert deleted == 5

    remaining = appr_mgr.get_audit_logs(limit=20)
    assert len(remaining) == 5


def test_resolve_writable_path():
    """
    Verifies that a valid writable path is used directly without fallback.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        expected_path = os.path.join(tmp_dir, "custom_agentguard.db")
        resolved = DatabaseManager._resolve_and_prepare_path(expected_path)
        assert os.path.abspath(resolved) == os.path.abspath(expected_path)


def test_resolve_unwritable_path_falls_back_to_ephemeral(monkeypatch):
    """
    Verifies that when parent directory is not writable (simulating Render Free plan non-root),
    DatabaseManager does not raise PermissionError and falls back to ephemeral tempdir storage.
    """
    def mock_access(path, mode):
        # Simulate /var/data or /restricted being not writable
        if "restricted" in path or "var" in path.lower():
            return False
        return True

    monkeypatch.setattr(os, "access", mock_access)

    unwritable_target = "/var/data/agentguard.db"
    resolved = DatabaseManager._resolve_and_prepare_path(unwritable_target)

    # Must fall back to tempfile location without raising PermissionError
    expected_fallback = os.path.join(tempfile.gettempdir(), "agentguard.db")
    assert os.path.abspath(resolved) == os.path.abspath(expected_fallback)


def test_approval_manager_unwritable_path_startup_resilience(monkeypatch):
    """
    Verifies that ApprovalManager initializes cleanly without raising
    PermissionError: [Errno 13] Permission denied when given an unwritable path.
    """
    def mock_access(path, mode):
        if "var" in path.lower():
            return False
        return True

    monkeypatch.setattr(os, "access", mock_access)

    # Should not raise PermissionError
    mgr = ApprovalManager(db_path="/var/data/agentguard.db")
    assert mgr.db_manager.db_path is not None
    assert "var" not in mgr.db_manager.db_path.lower()
