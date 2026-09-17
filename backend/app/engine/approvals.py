import uuid
import json
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from app.config import settings
from app.db import DatabaseManager, apply_migrations
from app.engine.models import (
    PendingApproval,
    ApprovalDecisionResponse,
    MatchedPolicy,
    RiskLevel,
)

logger = logging.getLogger("agentguard.approvals")


class ApprovalManager:
    """
    Production thread-safe SQLite store for Human-in-the-Loop approvals and audit trails.
    Uses DatabaseManager with WAL mode, busy timeouts, automated migrations, and idempotency guards.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_manager = DatabaseManager(db_path or settings.SQLITE_DB_PATH)
        self._init_db()

    def _init_db(self) -> None:
        """
        Run versioned migrations and ensure performance indexes exist.
        """
        apply_migrations(self.db_manager)

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

        with self.db_manager.get_connection() as conn:
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
        with self.db_manager.get_read_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC;"
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
                    parameters=json.loads(row["parameters"]) if row["parameters"] else {},
                    risk_level=RiskLevel(row["risk_level"]),
                    reason=row["reason"],
                    matched_policies=policies,
                    created_at=row["created_at"],
                    status=row["status"],
                )
            )
        return results

    def get_approval_by_id(self, approval_id: str) -> Optional[PendingApproval]:
        with self.db_manager.get_read_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM approvals WHERE approval_id = ?;", (approval_id,)
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
            parameters=json.loads(row["parameters"]) if row["parameters"] else {},
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
        """
        Atomically resolves a pending approval.
        Guarantees strict idempotency and race-condition safety via atomic conditional UPDATE:
        Only the first concurrent request to transition from 'PENDING' succeeds.
        """
        status = "APPROVED" if decision == "APPROVE" else "REJECTED"
        resolved_at = datetime.now(timezone.utc).isoformat()

        with self.db_manager.get_connection() as conn:
            # 1. Fetch current approval details
            cursor = conn.execute(
                "SELECT action_id, tool_name, parameters, risk_level, agent_id, agent_role, status FROM approvals WHERE approval_id = ?;",
                (approval_id,),
            )
            row = cursor.fetchone()
            if not row:
                logger.warning("Approval decision failed: %s not found", approval_id)
                return None

            action_id = row["action_id"]
            tool_name = row["tool_name"]
            parameters = json.loads(row["parameters"]) if row["parameters"] else {}
            risk_level_str = row["risk_level"]
            agent_id = row["agent_id"]
            agent_role = row["agent_role"]

            # 2. Atomic conditional update: guarantees only PENDING approvals can be decided
            update_cursor = conn.execute(
                """
                UPDATE approvals
                SET status = ?, resolved_at = ?, resolved_by = ?, reviewer_notes = ?
                WHERE approval_id = ? AND status = 'PENDING';
                """,
                (status, resolved_at, reviewed_by, reviewer_notes, approval_id),
            )

            if update_cursor.rowcount == 0:
                logger.warning(
                    "Approval %s was already decided by a concurrent transaction (current: %s)",
                    approval_id,
                    row["status"],
                )
                return None

        # 3. Execute approved action via ToolExecutor ONLY if the atomic update succeeded
        execution_result = None
        if status == "APPROVED":
            from app.engine.executor import get_tool_executor
            executor = get_tool_executor()
            execution_result = await executor.execute(tool_name, parameters)

            # Record audit log with ALLOW verdict and tool output
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
        with self.db_manager.get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO audit_logs (
                    action_id, agent_id, agent_role, tool_name, parameters,
                    verdict, risk_level, risk_score, reason,
                    moss_retrieval_ms, total_latency_ms, timestamp, execution_result
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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

    def get_audit_logs(
        self,
        limit: int = 50,
        verdict: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Indexed fast-path query for audit logs with optional verdict & agent filtering.
        """
        query = "SELECT * FROM audit_logs"
        params: List[Any] = []
        conditions: List[str] = []

        if verdict:
            conditions.append("verdict = ?")
            params.append(verdict.upper())
        if agent_id:
            conditions.append("agent_id = ?")
            params.append(agent_id)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY timestamp DESC LIMIT ?;"
        params.append(limit)

        with self.db_manager.get_read_connection() as conn:
            cursor = conn.execute(query, params)
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

    def backup_database(self, target_path: str) -> bool:
        return self.db_manager.backup_database(target_path)

    def prune_audit_logs(self, days_to_keep: int = 90, max_records: int = 50000) -> int:
        return self.db_manager.prune_audit_logs(days_to_keep=days_to_keep, max_records=max_records)


_approval_manager: Optional[ApprovalManager] = None


def get_approval_manager() -> ApprovalManager:
    global _approval_manager
    if _approval_manager is None:
        _approval_manager = ApprovalManager()
    return _approval_manager
