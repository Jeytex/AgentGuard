import logging
import sqlite3
from typing import List, Callable, Tuple, Optional
from datetime import datetime, timezone

from .connection import DatabaseManager, get_db_manager

logger = logging.getLogger("agentguard.db.migrations")


class SchemaMigrator:
    """
    Deterministic schema migration runner for AgentGuard SQLite database.
    Applies incremental, versioned migrations and maintains schema_migrations history.
    """

    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def _ensure_migration_table(self, conn: sqlite3.Connection) -> None:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
        """)

    def get_applied_versions(self, conn: sqlite3.Connection) -> List[int]:
        self._ensure_migration_table(conn)
        cursor = conn.execute("SELECT version FROM schema_migrations ORDER BY version ASC;")
        return [row["version"] for row in cursor.fetchall()]

    def run_migrations(self) -> int:
        """
        Executes all pending migrations sequentially within immediate transactions.
        Returns the number of newly applied migrations.
        """
        migrations = self._get_migration_registry()
        applied_count = 0

        with self.db_manager.get_connection() as conn:
            applied = set(self.get_applied_versions(conn))

            for version, name, func in migrations:
                if version not in applied:
                    logger.info("Applying database migration %d: %s", version, name)
                    func(conn)
                    conn.execute(
                        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);",
                        (version, name, datetime.now(timezone.utc).isoformat()),
                    )
                    applied_count += 1
                    logger.info("Successfully applied migration %d: %s", version, name)

        return applied_count

    def _get_migration_registry(self) -> List[Tuple[int, str, Callable[[sqlite3.Connection], None]]]:
        return [
            (1, "create_tables_and_performance_indexes", self._migration_1),
            (2, "ensure_execution_result_column", self._migration_2),
        ]

    @staticmethod
    def _migration_1(conn: sqlite3.Connection) -> None:
        # 1. Approvals Table
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

        # Approvals Performance Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status, created_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_approvals_action_id ON approvals(action_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);")

        # 2. Audit Logs Table
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

        # Audit Logs Performance Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_verdict ON audit_logs(verdict);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_agent ON audit_logs(agent_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_tool ON audit_logs(tool_name);")

    @staticmethod
    def _migration_2(conn: sqlite3.Connection) -> None:
        cursor = conn.execute("PRAGMA table_info(audit_logs);")
        columns = [col["name"] for col in cursor.fetchall()]
        if "execution_result" not in columns:
            conn.execute("ALTER TABLE audit_logs ADD COLUMN execution_result TEXT;")


def apply_migrations(db_manager: Optional[DatabaseManager] = None) -> int:
    mgr = db_manager or get_db_manager()
    migrator = SchemaMigrator(mgr)
    return migrator.run_migrations()
