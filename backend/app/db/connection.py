import os
import sqlite3
import logging
from contextlib import contextmanager
from typing import Optional, Generator
from datetime import datetime, timezone, timedelta

from app.config import settings

logger = logging.getLogger("agentguard.db")


class DatabaseManager:
    """
    Production-grade SQLite database manager with WAL concurrency,
    strict connection pragmas, online hot backup, and automated retention pruning.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.SQLITE_DB_PATH
        # Ensure parent directory exists
        db_dir = os.path.dirname(os.path.abspath(self.db_path))
        os.makedirs(db_dir, exist_ok=True)

    def create_connection(self) -> sqlite3.Connection:
        """
        Creates and configures a SQLite connection with production performance & concurrency pragmas.
        """
        conn = sqlite3.connect(
            self.db_path,
            timeout=10.0,
            check_same_thread=False,
            isolation_level=None,  # Autocommit mode; explicit transactions managed via BEGIN/COMMIT
        )
        conn.row_factory = sqlite3.Row

        # Apply production-critical SQLite PRAGMAs
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")       # 5000ms busy wait avoids locks under concurrency
        conn.execute("PRAGMA synchronous = NORMAL;")       # Safe with WAL, maximizes disk write performance
        conn.execute("PRAGMA foreign_keys = ON;")          # Enforce foreign key constraints
        conn.execute("PRAGMA cache_size = -64000;")        # 64MB in-memory page cache
        conn.execute("PRAGMA temp_store = MEMORY;")        # Keep temporary tables & indexes in RAM

        return conn

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """
        Context manager for acquiring a connection with transaction management.
        Automatically executes BEGIN and COMMIT / ROLLBACK on exception.
        """
        conn = self.create_connection()
        try:
            conn.execute("BEGIN IMMEDIATE;")
            yield conn
            conn.execute("COMMIT;")
        except Exception:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            raise
        finally:
            conn.close()

    @contextmanager
    def get_read_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """
        Context manager for read-only queries without transaction locks.
        """
        conn = self.create_connection()
        try:
            yield conn
        finally:
            conn.close()

    def backup_database(self, target_path: str) -> bool:
        """
        Performs an online, zero-downtime, non-blocking backup using SQLite's native backup API.
        Safe to call while live writes and reads are actively running.
        """
        target_dir = os.path.dirname(os.path.abspath(target_path))
        os.makedirs(target_dir, exist_ok=True)

        source_conn = self.create_connection()
        target_conn = sqlite3.connect(target_path)
        try:
            logger.info("Starting online database hot backup to %s", target_path)
            with target_conn:
                source_conn.backup(target_conn, pages=100, sleep=0.01)
            logger.info("Online hot backup completed successfully to %s", target_path)
            return True
        except Exception as e:
            logger.error("Failed to complete database backup: %s", str(e), exc_info=True)
            return False
        finally:
            target_conn.close()
            source_conn.close()

    def prune_audit_logs(self, days_to_keep: int = 90, max_records: int = 50000) -> int:
        """
        Retention management: prunes audit logs older than `days_to_keep` days,
        while ensuring the total log count does not exceed `max_records`.
        Returns the number of deleted records.
        """
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_to_keep)).isoformat()
        deleted_count = 0

        with self.get_connection() as conn:
            # 1. Prune by age
            cursor = conn.execute("DELETE FROM audit_logs WHERE timestamp < ?;", (cutoff_date,))
            deleted_count += cursor.rowcount

            # 2. Prune by maximum record capacity if exceeded
            cursor = conn.execute("SELECT COUNT(*) AS total FROM audit_logs;")
            total = cursor.fetchone()["total"]

            if total > max_records:
                overflow = total - max_records
                cur = conn.execute(
                    """
                    DELETE FROM audit_logs WHERE action_id IN (
                        SELECT action_id FROM audit_logs ORDER BY timestamp ASC LIMIT ?
                    );
                    """,
                    (overflow,),
                )
                deleted_count += cur.rowcount

        if deleted_count > 0:
            logger.info("Pruned %d expired audit records from database.", deleted_count)
        return deleted_count


_db_manager: Optional[DatabaseManager] = None


def get_db_manager() -> DatabaseManager:
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager
