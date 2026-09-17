import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.routes import router
from app.retrieval.provider import get_retrieval_provider
from app.engine.guard import get_guard_engine
from app.data.seed_policies import get_seed_policies, format_policies_for_moss

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("agentguard.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan handler: Warmed-up in-process indexes guarantee sub-10ms response from request #1.
    """
    logger.info("==================================================================")
    logger.info(f" Starting {settings.APP_NAME} v{settings.VERSION}")
    logger.info(" YC Fall 2026 x Moss: Zero Latency Builder Sprint")
    logger.info("==================================================================")

    provider = get_retrieval_provider()
    guard = get_guard_engine()

    try:
        await provider.initialize()
        logger.info(f"Retrieval provider active in mode: {provider.get_mode()}")

        # Ingest and warm up the policy index
        seed_docs = format_policies_for_moss()
        await provider.load_index(settings.POLICY_INDEX_NAME)
        if hasattr(provider, "_loaded_indexes") and settings.POLICY_INDEX_NAME not in provider._loaded_indexes:
            await provider.create_index(settings.POLICY_INDEX_NAME, seed_docs)
            await provider.load_index(settings.POLICY_INDEX_NAME)

        # Initialize incident index
        await provider.load_index(settings.INCIDENT_INDEX_NAME)
        if hasattr(provider, "_loaded_indexes") and settings.INCIDENT_INDEX_NAME not in provider._loaded_indexes:
            await provider.create_index(settings.INCIDENT_INDEX_NAME, [
                {"id": "inc_init_001", "text": "System initialization baseline security precedent record.", "metadata": {"status": "initialized"}}
            ])
            await provider.load_index(settings.INCIDENT_INDEX_NAME)


        # Register seed policies in guard lookup table
        for pol in get_seed_policies():
            guard.register_policy(pol)

        logger.info(f"Successfully seeded {len(seed_docs)} policies into Moss runtime.")
        logger.info("AgentGuard Sub-10ms Security Engine is HOT and ready for evaluation.")
    except Exception as e:
        logger.error(f"Error during AgentGuard warmup: {e}", exc_info=True)

    yield

    logger.info("Shutting down AgentGuard...")


app = FastAPI(
    title="AgentGuard — Sub-10ms Agent Security Layer",
    version="1.0.0",
    description=(
        "Real-time enterprise policy and safety gateway for autonomous AI agents. "
        "Powered by Moss in-process sub-10ms hybrid semantic search."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure permissive CORS so Claude's React frontend can communicate without friction
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Moss-Retrieval-Ms", "X-Guard-Total-Ms", "X-Guard-Verdict"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/", summary="Root endpoint")
async def root():
    return JSONResponse(
        content={
            "service": settings.APP_NAME,
            "version": settings.VERSION,
            "status": "operational",
            "docs": "/docs",
            "api_base": "/api/v1",
            "benchmark": "/api/v1/benchmark",
            "events_ws": "/api/v1/events/ws",
        }
    )


@app.get("/health", summary="Container Health Check")
async def health():
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.APP_NAME,
            "version": settings.VERSION,
        }
    )


@app.get("/health/live", summary="Liveness Probe")
async def liveness():
    return JSONResponse(content={"status": "alive"})


@app.get("/health/ready", summary="Readiness Probe")
async def readiness():
    from app.db import get_db_manager
    try:
        with get_db_manager().get_read_connection() as conn:
            conn.execute("SELECT 1;").fetchone()
        provider = get_retrieval_provider()
        mode = provider.get_mode()
        return JSONResponse(
            content={
                "status": "ready",
                "database": "connected",
                "retrieval_mode": mode,
            }
        )
    except Exception as e:
        logger.error("Readiness check failed: %s", str(e))
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": str(e)},
        )



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
