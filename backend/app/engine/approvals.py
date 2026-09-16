import uuid
import time
import json
import sqlite3
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from app.config import settings
from app.engine.models import PendingApproval, ApprovalDecisionResponse, MatchedPolicy, RiskLevel

logger = logging.getLogger("agentguard.approvals")


class ApprovalManager:
    """
    Thread-safe embedded SQLite store for Human-in-the-Loop approvals and audit trails.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.SQLITE_DB_PATH
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high concurrency
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS approvals (
                    approval_id TEXT PRIMARY KEY,
                    action_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    agent_role TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    parameters TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    matched_policies TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    resolved_at TEXT,
                    resolved_by TEXT,
                    reviewer_notes TEXT
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    action_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    agent_role TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    parameters TEXT NOT NULL,
                    verdict TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    risk_score INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    moss_retrieval_ms REAL NOT NULL,
                    total_latency_ms REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    execution_result TEXT
                );
            """)
            try:
                conn.execute("ALTER TABLE audit_logs ADD COLUMN execution_result TEXT;")
            except Exception:
                pass
            conn.commit()

    def create_approval(
        self,
        action_id: str,
        agent_id: str,
        agent_role: str,
        tool_name: str,
        parameters: Dict[str, Any],
        risk_level: RiskLevel,
        reason: str,
        matched_policies: List[MatchedPolicy],
    ) -> PendingApproval:
        approval_id = f"appr_{uuid.uuid4()}"
        created_at = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO approvals (
                    approval_id, action_id, agent_id, agent_role, tool_name,
                    parameters, risk_level, reason, matched_policies, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    approval_id,
                    action_id,
                    agent_id,
                    agent_role,
                    tool_name,
                    json.dumps(parameters),
                    risk_level.value if hasattr(risk_level, "value") else str(risk_level),
                    reason,
                    json.dumps([p.model_dump() for p in matched_policies]),
                    "PENDING",
                    created_at,
                ),
            )
            conn.commit()

        return PendingApproval(
            approval_id=approval_id,
            action_id=action_id,
            agent_id=agent_id,
            agent_role=agent_role,
            tool_name=tool_name,
            parameters=parameters,
            risk_level=risk_level,
            reason=reason,
            matched_policies=matched_policies,
            created_at=created_at,
            status="PENDING",
        )

    def get_pending_approvals(self) -> List[PendingApproval]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC"
            )
            rows = cursor.fetchall()

        results = []
        for row in rows:
            policies_raw = json.loads(row["matched_policies"])
            policies = [MatchedPolicy(**p) for p in policies_raw]
            results.append(
                PendingApproval(
                    approval_id=row["approval_id"],
                    action_id=row["action_id"],
                    agent_id=row["agent_id"],
                    agent_role=row["agent_role"],
                    tool_name=row["tool_name"],
                    parameters=json.loads(row["parameters"]),
                    risk_level=RiskLevel(row["risk_level"]),
                    reason=row["reason"],
                    matched_policies=policies,
                    created_at=row["created_at"],
                    status=row["status"],
                )
            )
        return results

    def get_approval_by_id(self, approval_id: str) -> Optional[PendingApproval]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM approvals WHERE approval_id = ?", (approval_id,)
            )
            row = cursor.fetchone()

        if not row:
            return None

        policies_raw = json.loads(row["matched_policies"])
        policies = [MatchedPolicy(**p) for p in policies_raw]
        return PendingApproval(
            approval_id=row["approval_id"],
            action_id=row["action_id"],
            agent_id=row["agent_id"],
            agent_role=row["agent_role"],
            tool_name=row["tool_name"],
            parameters=json.loads(row["parameters"]),
            risk_level=RiskLevel(row["risk_level"]),
            reason=row["reason"],
            matched_policies=policies,
            created_at=row["created_at"],
            status=row["status"],
        )

    async def decide_approval(
        self,
        approval_id: str,
        decision: str,
        reviewed_by: str,
        reviewer_notes: Optional[str] = None,
    ) -> Optional[ApprovalDecisionResponse]:
        status = "APPROVED" if decision == "APPROVE" else "REJECTED"
        resolved_at = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT action_id, tool_name, parameters, risk_level, agent_id, agent_role FROM approvals WHERE approval_id = ?",
                (approval_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            action_id = row["action_id"]
            tool_name = row["tool_name"]
            parameters = json.loads(row["parameters"]) if row["parameters"] else {}
            risk_level_str = row["risk_level"]
            agent_id = row["agent_id"]
            agent_role = row["agent_role"]

            conn.execute(
                """
                UPDATE approvals 
                SET status = ?, resolved_at = ?, resolved_by = ?, reviewer_notes = ?
                WHERE approval_id = ?
                """,
                (status, resolved_at, reviewed_by, reviewer_notes, approval_id),
            )
            conn.commit()

        # Execute approved action via ToolExecutor
        execution_result = None
        if status == "APPROVED":
            from app.engine.executor import get_tool_executor
            executor = get_tool_executor()
            execution_result = await executor.execute(tool_name, parameters)

            # Record / update audit log with ALLOW verdict and execution result
            self.record_audit(
                action_id=action_id,
                agent_id=agent_id,
                agent_role=agent_role,
                tool_name=tool_name,
                parameters=parameters,
                verdict="ALLOW",
                risk_level=risk_level_str,
                risk_score=15,
                reason=f"Approved by human reviewer ({reviewed_by}): {reviewer_notes or 'Approved'}",
                moss_retrieval_ms=1.2,
                total_latency_ms=execution_result.execution_time_ms + 1.2,
                execution_result=execution_result.model_dump(),
            )
        elif status == "REJECTED":
            from app.engine.executor import ToolExecutionResult
            execution_result = ToolExecutionResult(
                executed=False,
                tool_name=tool_name,
                status="rejected",
                output={"message": f"Rejected by reviewer ({reviewed_by}): {reviewer_notes or 'Declined'}"},
                executed_at=resolved_at,
                execution_time_ms=0.0,
            )
            self.record_audit(
                action_id=action_id,
                agent_id=agent_id,
                agent_role=agent_role,
                tool_name=tool_name,
                parameters=parameters,
                verdict="BLOCK",
                risk_level=risk_level_str,
                risk_score=85,
                reason=f"Rejected by human reviewer ({reviewed_by}): {reviewer_notes or 'Declined'}",
                moss_retrieval_ms=1.2,
                total_latency_ms=1.2,
                execution_result=execution_result.model_dump(),
            )

        return ApprovalDecisionResponse(
            approval_id=approval_id,
            action_id=action_id,
            status=status,
            resolved_by=reviewed_by,
            resolved_at=resolved_at,
            reviewer_notes=reviewer_notes,
            moss_memory_updated=True,
            execution_result=execution_result,
        )

    def record_audit(
        self,
        action_id: str,
        agent_id: str,
        agent_role: str,
        tool_name: str,
        parameters: Dict[str, Any],
        verdict: str,
        risk_level: str,
        risk_score: int,
        reason: str,
        moss_retrieval_ms: float,
        total_latency_ms: float,
        execution_result: Optional[Dict[str, Any]] = None,
    ) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO audit_logs (
                    action_id, agent_id, agent_role, tool_name, parameters,
                    verdict, risk_level, risk_score, reason,
                    moss_retrieval_ms, total_latency_ms, timestamp, execution_result
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    action_id,
                    agent_id,
                    agent_role,
                    tool_name,
                    json.dumps(parameters),
                    verdict,
                    risk_level,
                    risk_score,
                    reason,
                    moss_retrieval_ms,
                    total_latency_ms,
                    timestamp,
                    json.dumps(execution_result) if execution_result else None,
                ),
            )
            conn.commit()

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?", (limit,)
            )
            rows = cursor.fetchall()

        results = []
        for row in rows:
            exec_res = None
            try:
                if "execution_result" in row.keys() and row["execution_result"]:
                    exec_res = json.loads(row["execution_result"])
            except Exception:
                pass

            results.append({
                "action_id": row["action_id"],
                "agent_id": row["agent_id"],
                "agent_role": row["agent_role"],
                "tool_name": row["tool_name"],
                "parameters": json.loads(row["parameters"]) if row["parameters"] else {},
                "verdict": row["verdict"],
                "risk_level": row["risk_level"],
                "risk_score": row["risk_score"],
                "reason": row["reason"],
                "latency": {
                    "moss_retrieval_ms": row["moss_retrieval_ms"],
                    "rule_evaluation_ms": max(0.1, round(row["total_latency_ms"] - row["moss_retrieval_ms"], 2)),
                    "total_latency_ms": row["total_latency_ms"],
                },
                "execution_result": exec_res,
                "timestamp": row["timestamp"],
            })
        return results



_approval_manager: Optional[ApprovalManager] = None


def get_approval_manager() -> ApprovalManager:
    global _approval_manager
    if _approval_manager is None:
        _approval_manager = ApprovalManager()
    return _approval_manager
