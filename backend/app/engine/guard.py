import re
import time
import uuid
import json
import fnmatch
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.config import settings
from app.retrieval.provider import RetrievalProvider, get_retrieval_provider
from app.engine.approvals import ApprovalManager, get_approval_manager
from app.engine.models import (
    ActionEvaluationRequest,
    ActionEvaluationResponse,
    GuardVerdict,
    RiskLevel,
    MatchedPolicy,
    LatencyBreakdown,
    PolicyCategory,
)
from app.data.seed_policies import get_seed_policies
from app.engine.executor import get_tool_executor, ToolExecutionResult

logger = logging.getLogger("agentguard.guard")

# Pre-compiled injection heuristics for instant triage (<0.5ms)
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"system\s+prompt\s+override", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?guardrails", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+god\s+mode", re.IGNORECASE),
    re.compile(r"bypass\s+security\s+filter", re.IGNORECASE),
]

SSN_REGEX = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_REGEX = re.compile(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b")


class GuardEngine:
    """
    Sub-10ms Security and Reliability Engine for Autonomous AI Agents.
    Combines Moss in-memory retrieval with a deterministic fast-path rule engine.
    """

    def __init__(
        self,
        retrieval_provider: Optional[RetrievalProvider] = None,
        approval_manager: Optional[ApprovalManager] = None,
    ):
        self.provider = retrieval_provider or get_retrieval_provider()
        self.approval_manager = approval_manager or get_approval_manager()
        self._policy_lookup: Dict[str, Dict[str, Any]] = {
            p["id"]: p for p in get_seed_policies()
        }

    def register_policy(self, policy_data: Dict[str, Any]) -> None:
        self._policy_lookup[policy_data["id"]] = policy_data

    def get_all_policies(self) -> List[Dict[str, Any]]:
        return list(self._policy_lookup.values())

    async def evaluate_action(
        self, request: ActionEvaluationRequest
    ) -> ActionEvaluationResponse:
        start_wall_ns = time.perf_counter_ns()
        action_id = f"act_{uuid.uuid4()}"
        matched_policies: List[MatchedPolicy] = []

        # ==========================================
        # Stage 1: Fast Regex Pre-Triage (<0.5ms)
        # ==========================================
        params_str = json.dumps(request.parameters)
        combined_text = f"{params_str} {request.context or ''}"

        for pattern in INJECTION_PATTERNS:
            if pattern.search(combined_text):
                end_wall_ns = time.perf_counter_ns()
                total_ms = round((end_wall_ns - start_wall_ns) / 1_000_000, 3)
                logger.warning(f"Adversarial prompt injection detected: {pattern.pattern}")
                matched_policies.append(
                    MatchedPolicy(
                        policy_id="sys_triage_injection",
                        category=PolicyCategory.COMPLIANCE,
                        rule_text="Adversarial prompt injection attempt detected in payload.",
                        score=1.0,
                        enforcement=GuardVerdict.BLOCK,
                        reason=f"Matched malicious signature: {pattern.pattern}",
                    )
                )
                exec_result = ToolExecutionResult(
                    executed=False,
                    tool_name=request.tool_name,
                    status="blocked",
                    output={"error": "Catastrophic threat: Detected adversarial prompt injection payload.", "verdict": "BLOCK"},
                    executed_at=datetime.now(timezone.utc).isoformat(),
                    execution_time_ms=0.0,
                )
                response = ActionEvaluationResponse(
                    action_id=action_id,
                    agent_id=request.agent_id,
                    agent_role=request.agent_role,
                    tool_name=request.tool_name,
                    parameters=request.parameters,
                    verdict=GuardVerdict.BLOCK,
                    risk_level=RiskLevel.CRITICAL,
                    risk_score=100,
                    reason="Catastrophic threat: Detected adversarial prompt injection payload.",
                    matched_policies=matched_policies,
                    execution_result=exec_result,
                    latency=LatencyBreakdown(
                        moss_retrieval_ms=0.1,
                        rule_evaluation_ms=total_ms,
                        total_latency_ms=total_ms,
                    ),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
                if not request.dry_run:
                    self.approval_manager.record_audit(
                        action_id=action_id,
                        agent_id=request.agent_id,
                        agent_role=request.agent_role,
                        tool_name=request.tool_name,
                        parameters=request.parameters,
                        verdict=response.verdict.value,
                        risk_level=response.risk_level.value,
                        risk_score=response.risk_score,
                        reason=response.reason,
                        moss_retrieval_ms=0.1,
                        total_latency_ms=total_ms,
                        execution_result=exec_result.model_dump(),
                    )
                return response


        # ==========================================
        # Stage 2: Moss In-Memory Retrieval (3-5ms)
        # ==========================================
        retrieval_query = (
            f"{request.tool_name} role:{request.agent_role} {params_str[:150]} {request.context or ''}"
        )
        
        moss_res = await self.provider.query(
            settings.POLICY_INDEX_NAME,
            retrieval_query,
            top_k=5,
        )
        moss_retrieval_ms = moss_res.wall_clock_ms if moss_res.wall_clock_ms is not None else moss_res.time_taken_ms
        native_moss_ms = moss_res.native_time_ms

        # ==========================================
        # Stage 3: Fast-Path Rule Evaluation (<1.5ms)
        # ==========================================
        rule_eval_start = time.perf_counter_ns()

        worst_verdict = GuardVerdict.ALLOW
        highest_risk = RiskLevel.LOW
        max_risk_score = 10
        primary_reason = "Action complies with all enterprise security policies."

        # Evaluate against retrieved policies
        for doc in moss_res.docs:
            policy_id = doc.metadata.get("policy_id") or doc.id
            pol_def = self._policy_lookup.get(policy_id)

            if not pol_def or not pol_def.get("is_active", True):
                continue

            # Check tool applicability (supports wildcards, e.g. stripe_*)
            target_tools = pol_def.get("target_tools", ["*"])
            applies = any(
                t == "*" or fnmatch.fnmatch(request.tool_name.lower(), t.lower())
                for t in target_tools
            )
            if not applies:
                continue

            conditions = pol_def.get("conditions", {})
            violation_found = False
            violation_reason = ""

            # Check 1: Financial limits
            if "max_amount" in conditions:
                max_amt = float(conditions["max_amount"])
                # Extract numerical amount from parameters
                extracted_amt = None
                for k in ["amount", "value", "total", "price", "refund_amount"]:
                    if k in request.parameters:
                        try:
                            extracted_amt = float(request.parameters[k])
                            break
                        except (ValueError, TypeError):
                            pass

                if extracted_amt is not None and extracted_amt > max_amt:
                    violation_found = True
                    violation_reason = (
                        f"Amount (${extracted_amt:,.2f}) exceeds threshold (${max_amt:,.2f})"
                    )

            # Check 2: Blocked destructive keywords (SQL drop, bash commands)
            if "blocked_keywords" in conditions:
                param_text_lower = params_str.lower()
                for kw in conditions["blocked_keywords"]:
                    if kw.lower() in param_text_lower:
                        violation_found = True
                        violation_reason = f"Contains prohibited destructive expression '{kw}'"
                        break

            # Check 3: PII patterns (SSN, credit cards)
            if "pii_patterns" in conditions:
                for pat in conditions["pii_patterns"]:
                    if re.search(pat, params_str):
                        violation_found = True
                        violation_reason = "Detected unmasked SSN or Payment Card pattern"
                        break
            # Fallback regex check for PII
            if pol_def.get("category") == PolicyCategory.PII:
                if SSN_REGEX.search(params_str) or CREDIT_CARD_REGEX.search(params_str):
                    violation_found = True
                    violation_reason = "Detected unmasked SSN or Credit Card data in parameters"

            # Check 4: RBAC Role restrictions
            if "disallowed_roles" in conditions:
                if request.agent_role.lower() in [r.lower() for r in conditions["disallowed_roles"]]:
                    violation_found = True
                    violation_reason = (
                        f"Role '{request.agent_role}' is prohibited from executing this tool"
                    )

            if "allowed_roles" in conditions:
                if request.agent_role.lower() not in [r.lower() for r in conditions["allowed_roles"]]:
                    violation_found = True
                    violation_reason = (
                        f"Role '{request.agent_role}' lacks required permissions (requires: {conditions['allowed_roles']})"
                    )

            # Check 5: Max record bulk limit
            if "max_records" in conditions:
                max_rec = int(conditions["max_records"])
                extracted_count = None
                for k in ["limit", "count", "batch_size", "rows"]:
                    if k in request.parameters:
                        try:
                            extracted_count = int(request.parameters[k])
                            break
                        except (ValueError, TypeError):
                            pass
                if extracted_count is not None and extracted_count > max_rec:
                    violation_found = True
                    violation_reason = (
                        f"Record count ({extracted_count}) exceeds limit ({max_rec})"
                    )

            if violation_found:
                enforcement = pol_def["enforcement"]
                rule_risk = pol_def["risk_level"]

                matched_policies.append(
                    MatchedPolicy(
                        policy_id=policy_id,
                        category=pol_def["category"],
                        rule_text=pol_def["rule_text"],
                        score=doc.score if doc.score > 0 else 0.85,
                        enforcement=enforcement,
                        reason=violation_reason,
                    )
                )

                # Escalate verdict (BLOCK > REQUIRE_APPROVAL > ALLOW)
                if enforcement == GuardVerdict.BLOCK:
                    worst_verdict = GuardVerdict.BLOCK
                    highest_risk = RiskLevel.CRITICAL
                    max_risk_score = max(max_risk_score, 95)
                    primary_reason = f"Action blocked: {violation_reason} ({pol_def['name']})."
                elif enforcement == GuardVerdict.REQUIRE_APPROVAL:
                    if worst_verdict != GuardVerdict.BLOCK:
                        worst_verdict = GuardVerdict.REQUIRE_APPROVAL
                        highest_risk = RiskLevel.HIGH
                        max_risk_score = max(max_risk_score, 75)
                        primary_reason = (
                            f"Approval required: {violation_reason} ({pol_def['name']})."
                        )

        # ==========================================
        # Stage 4: Enqueue Approval (if needed)
        # ==========================================
        approval_id: Optional[str] = None
        if worst_verdict == GuardVerdict.REQUIRE_APPROVAL and not request.dry_run:
            pending_appr = self.approval_manager.create_approval(
                action_id=action_id,
                agent_id=request.agent_id,
                agent_role=request.agent_role,
                tool_name=request.tool_name,
                parameters=request.parameters,
                risk_level=highest_risk,
                reason=primary_reason,
                matched_policies=matched_policies,
            )
            approval_id = pending_appr.approval_id

        # ==========================================
        # Stage 5: Execution Gateway (Tool Executor)
        # ==========================================
        execution_result: Optional[ToolExecutionResult] = None
        if worst_verdict == GuardVerdict.ALLOW:
            if not request.dry_run:
                executor = get_tool_executor()
                execution_result = await executor.execute(request.tool_name, request.parameters)
        elif worst_verdict == GuardVerdict.BLOCK:
            execution_result = ToolExecutionResult(
                executed=False,
                tool_name=request.tool_name,
                status="blocked",
                output={"error": primary_reason, "verdict": "BLOCK"},
                executed_at=datetime.now(timezone.utc).isoformat(),
                execution_time_ms=0.0,
            )
        elif worst_verdict == GuardVerdict.REQUIRE_APPROVAL:
            execution_result = ToolExecutionResult(
                executed=False,
                tool_name=request.tool_name,
                status="pending_approval",
                output={"message": primary_reason, "approval_id": approval_id},
                executed_at=datetime.now(timezone.utc).isoformat(),
                execution_time_ms=0.0,
            )

        # High-resolution wall-clock timing
        end_wall_ns = time.perf_counter_ns()
        rule_eval_ns = end_wall_ns - rule_eval_start
        total_latency_ms = round((end_wall_ns - start_wall_ns) / 1_000_000, 3)
        rule_eval_ms = round(rule_eval_ns / 1_000_000, 3)

        response = ActionEvaluationResponse(
            action_id=action_id,
            agent_id=request.agent_id,
            agent_role=request.agent_role,
            tool_name=request.tool_name,
            parameters=request.parameters,
            verdict=worst_verdict,
            risk_level=highest_risk,
            risk_score=max_risk_score,
            reason=primary_reason,
            matched_policies=matched_policies,
            approval_id=approval_id,
            execution_result=execution_result,
            latency=LatencyBreakdown(
                moss_retrieval_ms=moss_retrieval_ms,
                rule_evaluation_ms=rule_eval_ms,
                total_latency_ms=total_latency_ms,
                native_moss_ms=native_moss_ms,
            ),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        if not request.dry_run:
            self.approval_manager.record_audit(
                action_id=action_id,
                agent_id=request.agent_id,
                agent_role=request.agent_role,
                tool_name=request.tool_name,
                parameters=request.parameters,
                verdict=response.verdict.value,
                risk_level=response.risk_level.value,
                risk_score=response.risk_score,
                reason=response.reason,
                moss_retrieval_ms=moss_retrieval_ms,
                total_latency_ms=total_latency_ms,
                execution_result=execution_result.model_dump() if execution_result else None,
            )

        return response


_guard_engine: Optional[GuardEngine] = None


def get_guard_engine() -> GuardEngine:
    global _guard_engine
    if _guard_engine is None:
        _guard_engine = GuardEngine()
    return _guard_engine
