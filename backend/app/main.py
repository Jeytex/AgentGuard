import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.routes import router, make_moss_degraded_response, is_moss_degraded_exception
from app.retrieval.provider import get_retrieval_provider
from app.retrieval.moss_client import MossUnavailableError
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

    # Register seed policies in guard lookup table first
    for pol in get_seed_policies():
        guard.register_policy(pol)

    try:
        await provider.initialize()
        logger.info(f"Retrieval provider active in mode: {provider.get_mode()}")

        # Ingest and warm up the policy index
        seed_docs = format_policies_for_moss()
        try:
            await provider.load_index(settings.POLICY_INDEX_NAME)
        except Exception:
            await provider.create_index(settings.POLICY_INDEX_NAME, seed_docs)
            await provider.load_index(settings.POLICY_INDEX_NAME)

        # Ensure incident index exists for audit event logging
        try:
            if hasattr(provider, "client") and provider.client:
                indexes = await provider.client.list_indexes()
                idx_names = [idx.name for idx in indexes]
                if settings.INCIDENT_INDEX_NAME not in idx_names:
                    await provider.create_index(settings.INCIDENT_INDEX_NAME, [
                        {"id": "inc_init_001", "text": "System initialization baseline security precedent record.", "metadata": {"status": "initialized"}}
                    ])
            elif hasattr(provider, "create_index"):
                await provider.create_index(settings.INCIDENT_INDEX_NAME, [
                    {"id": "inc_init_001", "text": "System initialization baseline security precedent record.", "metadata": {"status": "initialized"}}
                ])
        except Exception as e:
            logger.info("Incident index initialization notice: %s", e)

        logger.info(f"Successfully seeded {len(seed_docs)} policies into Moss runtime.")
        logger.info("AgentGuard Sub-10ms Security Engine is HOT and ready for evaluation.")
    except Exception as e:
        if hasattr(provider, "_mark_degraded"):
            provider._mark_degraded(e)
        allow_fallback = getattr(provider, "allow_fallback", settings.MOSS_MOCK_FALLBACK)
        if allow_fallback and hasattr(provider, "_get_fallback_provider"):
            logger.warning(
                "Warmup encountered live Moss error (%s). Fallback enabled: priming in-process fallback provider.",
                e,
            )
            fallback = provider._get_fallback_provider()
            await fallback.create_index(settings.POLICY_INDEX_NAME, format_policies_for_moss())
            await fallback.create_index(settings.INCIDENT_INDEX_NAME, [
                {"id": "inc_init_001", "text": "System initialization baseline security precedent record.", "metadata": {"status": "initialized"}}
            ])
        else:
            logger.warning(
                "Warmup encountered live Moss error (%s). Fallback is disabled (MOSS_MOCK_FALLBACK=false). "
                "Preserving graceful startup in mode: %s.",
                e,
                provider.get_mode(),
            )

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


@app.exception_handler(MossUnavailableError)
async def moss_unavailable_exception_handler(request: Request, exc: MossUnavailableError):
    return make_moss_degraded_response(request, exc)


@app.exception_handler(RuntimeError)
async def runtime_error_exception_handler(request: Request, exc: RuntimeError):
    if is_moss_degraded_exception(exc):
        return make_moss_degraded_response(request, exc)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_SERVER_ERROR", "detail": str(exc)},
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


@app.api_route("/health", methods=["GET", "HEAD"], summary="Container Health Check")
async def health():
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.APP_NAME,
            "version": settings.VERSION,
        }
    )


@app.api_route("/health/live", methods=["GET", "HEAD"], summary="Liveness Probe")
async def liveness():
    return JSONResponse(content={"status": "alive"})


@app.api_route("/health/ready", methods=["GET", "HEAD"], summary="Readiness Probe")
async def readiness():
    from app.db import get_db_manager
    try:
        with get_db_manager().get_read_connection() as conn:
            conn.execute("SELECT 1;").fetchone()
        provider = get_retrieval_provider()
        mode = provider.get_mode()
        moss_connected = (
            provider.is_live_moss_connected()
            if hasattr(provider, "is_live_moss_connected")
            else (provider.is_connected() and mode == "live_moss")
        )
        return JSONResponse(
            content={
                "status": "ready",
                "database": "connected",
                "retrieval_mode": mode,
                "moss_connected": moss_connected,
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
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG and settings.ENVIRONMENT == "development",
    )
