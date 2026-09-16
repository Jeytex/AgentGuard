from typing import List, Dict, Any
from app.engine.models import PolicyCategory, GuardVerdict, RiskLevel

SEED_POLICIES: List[Dict[str, Any]] = [
    # --- Financial Policies ---
    {
        "id": "pol_fin_001",
        "category": PolicyCategory.FINANCIAL,
        "name": "High Value Refund Threshold",
        "rule_text": "Refunds greater than $1,000 require human admin approval.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["stripe_*", "refund_*", "payment_*"],
        "conditions": {"max_amount": 1000.0, "amount_key": "amount"},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_fin_002",
        "category": PolicyCategory.FINANCIAL,
        "name": "External Wire Transfer Restriction",
        "rule_text": "Direct external bank wire transfers or cryptocurrency payouts require executive approval.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["wire_transfer", "crypto_payout", "swift_payment"],
        "conditions": {"allowed_roles": ["executive", "cfo"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_fin_003",
        "category": PolicyCategory.FINANCIAL,
        "name": "Single Session Spending Cap",
        "rule_text": "Cumulative spending or single purchase exceeding $10,000 is strictly blocked for automated agents.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["stripe_*", "purchase_*", "checkout_*"],
        "conditions": {"max_amount": 10000.0, "amount_key": "amount"},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },

    # --- Destructive Infrastructure Policies ---
    {
        "id": "pol_destr_001",
        "category": PolicyCategory.DESTRUCTIVE,
        "name": "Production Database Mutation Ban",
        "rule_text": "Never drop, truncate, or alter production tables or schemas.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["db_*", "sql_*", "postgres_*", "mysql_*"],
        "conditions": {"blocked_keywords": ["drop table", "truncate", "alter table", "drop database", "rm -rf"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_destr_002",
        "category": PolicyCategory.DESTRUCTIVE,
        "name": "Host Command Injection Prevention",
        "rule_text": "Executing arbitrary shell or system commands (rm, sudo, mkfs, curl piping) is strictly blocked.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["bash_*", "shell_*", "exec_*", "terminal_*"],
        "conditions": {"blocked_keywords": ["sudo", "rm -rf", "mkfs", "| sh", "| bash", ":(){ :|:& };:"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_destr_003",
        "category": PolicyCategory.DESTRUCTIVE,
        "name": "Cluster Node Termination",
        "rule_text": "Terminating or scaling production Kubernetes nodes or cloud instances requires DevOps approval.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["k8s_*", "aws_*", "gcp_*", "scale_*"],
        "conditions": {"allowed_roles": ["devops", "sre"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },

    # --- PII & Sensitive Data Policies ---
    {
        "id": "pol_pii_001",
        "category": PolicyCategory.PII,
        "name": "Cleartext SSN and Card Number Ban",
        "rule_text": "Unmasked extraction or export of Social Security Numbers, credit cards, or passwords is prohibited.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["crm_*", "export_*", "analytics_*", "user_*"],
        "conditions": {"pii_patterns": [r"\b\d{3}-\d{2}-\d{4}\b", r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_pii_002",
        "category": PolicyCategory.PII,
        "name": "Bulk Customer Record Export",
        "rule_text": "Exporting customer record batches greater than 100 entries requires Data Protection Officer approval.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["crm_export", "user_export", "customer_download"],
        "conditions": {"max_records": 100, "count_key": "limit"},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_pii_003",
        "category": PolicyCategory.PII,
        "name": "Unencrypted Health Data Exfiltration",
        "rule_text": "Transmitting HIPAA-governed patient health data or medical records to external domains is blocked.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["email_*", "webhook_*", "http_post"],
        "conditions": {"blocked_keywords": ["diagnosis", "medical_record", "patient_history", "prescription"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },

    # --- Role-Based Access Control (RBAC) ---
    {
        "id": "pol_rbac_001",
        "category": PolicyCategory.RBAC,
        "name": "Support Tier Subscription Modification",
        "rule_text": "Tier 1 Support agents cannot modify pricing tiers, discount percentages, or subscription state.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["billing_modify", "update_subscription", "apply_discount"],
        "conditions": {"disallowed_roles": ["tier_1_support", "support", "guest"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_rbac_002",
        "category": PolicyCategory.RBAC,
        "name": "Direct Database Write for Read-Only Roles",
        "rule_text": "Junior analysts and read-only roles are prohibited from executing database write operations.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["db_insert", "db_update", "db_delete"],
        "conditions": {"disallowed_roles": ["junior_analyst", "analyst", "viewer"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_rbac_003",
        "category": PolicyCategory.RBAC,
        "name": "IAM Secret and Key Generation",
        "rule_text": "Generating new IAM access keys or modifying security credentials requires Admin approval.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.HIGH,
        "target_tools": ["iam_*", "create_key", "rotate_credentials"],
        "conditions": {"allowed_roles": ["security_admin", "admin"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },

    # --- Compliance & Safety ---
    {
        "id": "pol_compl_001",
        "category": PolicyCategory.COMPLIANCE,
        "name": "Audit Logging Deactivation Ban",
        "rule_text": "Security audit logs, system telemetry, and compliance tracing cannot be disabled.",
        "enforcement": GuardVerdict.BLOCK,
        "risk_level": RiskLevel.CRITICAL,
        "target_tools": ["telemetry_*", "log_*", "config_*"],
        "conditions": {"blocked_keywords": ["disable_logging", "suppress_audit", "delete_logs"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "pol_compl_002",
        "category": PolicyCategory.COMPLIANCE,
        "name": "GDPR Scheduled Account Purge",
        "rule_text": "GDPR right-to-be-forgotten customer deletions must be queued for compliance review.",
        "enforcement": GuardVerdict.REQUIRE_APPROVAL,
        "risk_level": RiskLevel.MEDIUM,
        "target_tools": ["gdpr_delete", "purge_user", "delete_account"],
        "conditions": {"allowed_roles": ["privacy_officer", "admin"]},
        "is_active": True,
        "created_at": "2026-09-16T00:00:00Z",
    },
]


def get_seed_policies() -> List[Dict[str, Any]]:
    return SEED_POLICIES


def format_policies_for_moss() -> List[Dict[str, Any]]:
    """Format policies into DocumentInfo dictionary representation for Moss indexing."""
    docs = []
    for pol in SEED_POLICIES:
        metadata = {
            "policy_id": pol["id"],
            "category": pol["category"].value if hasattr(pol["category"], "value") else str(pol["category"]),
            "enforcement": pol["enforcement"].value if hasattr(pol["enforcement"], "value") else str(pol["enforcement"]),
            "risk_level": pol["risk_level"].value if hasattr(pol["risk_level"], "value") else str(pol["risk_level"]),
            "name": pol["name"],
        }
        # Include tool pattern in metadata
        if pol.get("target_tools"):
            metadata["tools"] = ",".join(pol["target_tools"])

        docs.append({
            "id": pol["id"],
            "text": f"{pol['name']}: {pol['rule_text']} Applies to tools: {', '.join(pol['target_tools'])}",
            "metadata": metadata,
        })
    return docs
