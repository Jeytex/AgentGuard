import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class ToolExecutionResult(BaseModel):
    executed: bool = Field(..., description="Whether the tool was actually executed")
    tool_name: str = Field(..., description="Name of the executed tool")
    status: str = Field(..., description="Execution status: success | failed | blocked | pending_approval")
    output: Dict[str, Any] = Field(default_factory=dict, description="Output payload from external API")
    executed_at: str = Field(..., description="ISO 8601 timestamp of execution")
    execution_time_ms: float = Field(0.0, description="External API round-trip execution latency in ms")


class ToolExecutor:
    """
    Executes approved or allowed agent tool actions against simulated external APIs.
    Simulates real API side-effects with realistic response schemas and execution timings.
    """

    def __init__(self):
        pass

    async def execute(self, tool_name: str, parameters: Dict[str, Any]) -> ToolExecutionResult:
        start = time.perf_counter()
        executed_at = datetime.now(timezone.utc).isoformat()

        # Route to appropriate simulated external API
        lower_tool = tool_name.lower()

        try:
            if "stripe" in lower_tool or "refund" in lower_tool:
                output = self._simulate_stripe_api(parameters)
            elif "calendar" in lower_tool:
                output = self._simulate_calendar_api(parameters)
            elif "db" in lower_tool or "sql" in lower_tool:
                output = self._simulate_database_api(parameters)
            elif "crm" in lower_tool or "customer" in lower_tool or "export" in lower_tool:
                output = self._simulate_crm_api(parameters)
            elif "billing" in lower_tool or "subscription" in lower_tool:
                output = self._simulate_billing_api(parameters)
            else:
                output = self._simulate_generic_api(tool_name, parameters)

            execution_time_ms = round((time.perf_counter() - start) * 1000, 2)
            return ToolExecutionResult(
                executed=True,
                tool_name=tool_name,
                status="success",
                output=output,
                executed_at=executed_at,
                execution_time_ms=execution_time_ms,
            )
        except Exception as e:
            execution_time_ms = round((time.perf_counter() - start) * 1000, 2)
            return ToolExecutionResult(
                executed=False,
                tool_name=tool_name,
                status="failed",
                output={"error": str(e), "message": "Simulated external API execution failed."},
                executed_at=executed_at,
                execution_time_ms=execution_time_ms,
            )

    def _simulate_stripe_api(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        amount = parameters.get("amount", 0)
        currency = parameters.get("currency", "USD").upper()
        customer_id = parameters.get("customer_id", f"cus_{uuid.uuid4().hex[:8]}")
        refund_id = f"re_{uuid.uuid4().hex[:16]}"
        charge_id = parameters.get("charge_id", f"ch_{uuid.uuid4().hex[:14]}")

        return {
            "api": "Stripe Payments API v1",
            "object": "refund",
            "id": refund_id,
            "amount": amount,
            "currency": currency,
            "charge": charge_id,
            "customer": customer_id,
            "status": "succeeded",
            "receipt_number": f"REC-{uuid.uuid4().hex[:6].upper()}",
            "message": f"Successfully processed {currency} {amount:,.2f} refund for customer {customer_id}.",
        }

    def _simulate_calendar_api(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        target_date = parameters.get("date", datetime.now().strftime("%Y-%m-%d"))
        tz = parameters.get("time_zone", "UTC")

        return {
            "api": "Google Calendar API v3",
            "calendar_id": "primary",
            "time_zone": tz,
            "date": target_date,
            "items_count": 3,
            "events": [
                {"id": "evt_001", "summary": "Sprint Planning & Standup", "start": f"{target_date}T09:30:00", "end": f"{target_date}T10:00:00"},
                {"id": "evt_002", "summary": "AgentGuard Architecture Sync", "start": f"{target_date}T14:00:00", "end": f"{target_date}T15:00:00"},
                {"id": "evt_003", "summary": "Security & Red-Teaming Review", "start": f"{target_date}T16:30:00", "end": f"{target_date}T17:00:00"},
            ],
            "message": f"Retrieved 3 scheduled events for {target_date} ({tz}).",
        }

    def _simulate_database_api(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        query = parameters.get("query", "SELECT 1;")
        database = parameters.get("database", "production_replica")

        return {
            "api": "PostgreSQL Client Engine",
            "database": database,
            "query_executed": query,
            "rows_affected": 4,
            "duration_ms": 1.45,
            "columns": ["id", "tenant_id", "status", "created_at"],
            "sample_rows": [
                [101, "tenant_alpha", "active", "2026-09-01T12:00:00Z"],
                [102, "tenant_beta", "pending", "2026-09-02T14:20:00Z"],
                [103, "tenant_gamma", "active", "2026-09-03T09:15:00Z"],
                [104, "tenant_delta", "active", "2026-09-04T16:45:00Z"],
            ],
            "message": f"Query executed successfully on {database}.",
        }

    def _simulate_crm_api(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        query = parameters.get("query", "")
        limit = parameters.get("limit") or parameters.get("count") or 10
        format_type = parameters.get("format", "json")

        return {
            "api": "Salesforce CRM Customer API",
            "operation": "customer_query",
            "query": query,
            "format": format_type,
            "records_returned": min(int(limit), 50),
            "export_job_id": f"job_{uuid.uuid4().hex[:10]}",
            "status": "completed",
            "message": f"Exported customer records matching criteria in {format_type.upper()} format.",
        }

    def _simulate_billing_api(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        user_id = parameters.get("user_id", "usr_unknown")
        new_tier = parameters.get("new_tier", "standard")
        discount = parameters.get("discount", 0)

        return {
            "api": "Billing Subscription Gateway",
            "user_id": user_id,
            "updated_tier": new_tier,
            "discount_applied_percent": discount,
            "status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "message": f"Subscription for user {user_id} updated to '{new_tier}' with {discount}% discount.",
        }

    def _simulate_generic_api(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "api": f"External API ({tool_name})",
            "tool": tool_name,
            "status": "executed",
            "parameters_received": parameters,
            "message": f"Successfully executed tool '{tool_name}' in simulated downstream environment.",
        }


_tool_executor: Optional[ToolExecutor] = None


def get_tool_executor() -> ToolExecutor:
    global _tool_executor
    if _tool_executor is None:
        _tool_executor = ToolExecutor()
    return _tool_executor
