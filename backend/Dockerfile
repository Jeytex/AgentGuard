# ==============================================================================
# AgentGuard Backend — Production Dockerfile
# Multi-stage, unprivileged non-root user, slim Python 3.12 runtime.
# ==============================================================================

FROM python:3.12-slim AS runner

# Set Python operational flags
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    HOST=0.0.0.0 \
    PORT=8000 \
    SQLITE_DB_PATH=/app/data/agentguard.db

# Install curl for container health check probes
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create security-hardened unprivileged system group and user
RUN groupadd -g 1000 agentguard \
    && useradd -u 1000 -g agentguard -s /bin/false -m agentguard

WORKDIR /app

# Install Python production dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY app/ ./app

# Create directory for persistent SQLite database and set ownership
RUN mkdir -p /app/data \
    && chown -R agentguard:agentguard /app

# Switch to unprivileged execution user
USER agentguard

# Declare persistent volume mount for SQLite audit logs
VOLUME ["/app/data"]

EXPOSE 8000

# Health check configuration
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start production FastAPI application with Uvicorn
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
