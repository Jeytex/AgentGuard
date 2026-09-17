import os
import sqlite3
import logging
import tempfile
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
        target_path = db_path or settings.SQLITE_DB_PATH
        self.db_path = self._resolve_and_prepare_path(target_path)

    @classmethod
    def _resolve_and_prepare_path(cls, path: str) -> str:
        """
        Ensures the database directory exists and is writable.
        If the target parent directory does not exist and cannot be created due to permission
        limitations (e.g. running as non-root on an ephemeral host without persistent disk),
        gracefully falls back to a writable ephemeral path (/tmp/agentguard.db).
        """
        if path == ":memory:":
            return path

        abs_path = os.path.abspath(path)
        db_dir = os.path.dirname(abs_path)

        # Check if directory already exists
        if os.path.exists(db_dir):
            if os.access(db_dir, os.W_OK):
                return abs_path
            logger.warning(
                "Database directory '%s' exists but is not writable by the current user.",
                db_dir,
            )
        else:
            # Check closest existing parent directory permissions before attempting mkdir
            parent = db_dir
            while parent and not os.path.exists(parent):
                next_parent = os.path.dirname(parent)
                if next_parent == parent:
                    break
                parent = next_parent

            if parent and os.access(parent, os.W_OK):
                try:
                    os.makedirs(db_dir, exist_ok=True)
                    if os.access(db_dir, os.W_OK):
                        return abs_path
                except (PermissionError, OSError) as exc:
                    logger.warning(
                        "Permission denied creating database directory '%s': %s",
                        db_dir,
                        exc,
                    )
            else:
                logger.warning(
                    "Cannot create database directory '%s'; existing parent '%s' is not writable.",
                    db_dir,
                    parent,
                )

        # Fallback to standard writable temporary directory (ephemeral storage)
        fallback_dir = tempfile.gettempdir()
        fallback_path = os.path.join(fallback_dir, "agentguard.db")
        logger.warning(
            "Configured database path '%s' is not writable or its parent cannot be created. "
            "Falling back to writable ephemeral database path: '%s'. "
            "(Note: To persist data across restarts, ensure a persistent disk is mounted at '%s').",
            path,
            fallback_path,
            db_dir,
        )
        try:
            os.makedirs(fallback_dir, exist_ok=True)
        except Exception:
            pass
        return fallback_path

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
        try:
            if not os.path.exists(target_dir):
                parent = target_dir
                while parent and not os.path.exists(parent):
                    next_parent = os.path.dirname(parent)
                    if next_parent == parent:
                        break
                    parent = next_parent
                if parent and os.access(parent, os.W_OK):
                    os.makedirs(target_dir, exist_ok=True)
                else:
                    logger.error(
                        "Cannot create backup directory '%s': parent directory '%s' is not writable.",
                        target_dir,
                        parent,
                    )
                    return False
            elif not os.access(target_dir, os.W_OK):
                logger.error("Backup directory '%s' is not writable.", target_dir)
                return False

            source_conn = self.create_connection()
            target_conn = sqlite3.connect(target_path)
            try:
                logger.info("Starting online database hot backup to %s", target_path)
                with target_conn:
                    source_conn.backup(target_conn, pages=100, sleep=0.01)
                logger.info("Online hot backup completed successfully to %s", target_path)
                return True
            finally:
                target_conn.close()
                source_conn.close()
        except Exception as e:
            logger.error("Failed to complete database backup: %s", str(e), exc_info=True)
            return False

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
