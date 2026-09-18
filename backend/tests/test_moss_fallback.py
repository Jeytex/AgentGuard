import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.retrieval.moss_client import MossRetrievalProvider
from app.retrieval.provider import set_retrieval_provider, reset_retrieval_provider
from app.data.seed_policies import format_policies_for_moss


@pytest.fixture(autouse=True)
def clean_provider():
    yield
    reset_retrieval_provider()


@pytest.mark.asyncio
async def test_moss_credit_exhaustion_fallback_disabled():
    """
    When MOSS_MOCK_FALLBACK=false (fallback disabled):
    - Any live Moss credit exhaustion / 429 error must NOT silently fall back to mock.
    - Provider must report mode 'moss_degraded', never 'live_moss'.
    - is_connected() and is_live_moss_connected() must return False.
    - query() must raise an explicit RuntimeError.
    """
    provider = MossRetrievalProvider(
        project_id="test_pid",
        project_key="test_pkey",
        allow_fallback=False,
    )

    mock_client = MagicMock()
    mock_client.query = AsyncMock(
        side_effect=RuntimeError('HTTP 429 Too Many Requests: {"error":"USAGE_LIMIT_EXCEEDED","message":"credit_exhausted"}')
    )
    mock_client.load_index = AsyncMock(return_value=None)
    provider.client = mock_client
    provider._connected = True
    provider._loaded_indexes.add("agentguard-policies")

    # Mode before query should be live_moss
    assert provider.get_mode() == "live_moss"
    assert provider.is_connected() is True
    assert provider.is_live_moss_connected() is True

    # Querying should fail explicitly and NOT silently fall back
    with pytest.raises(RuntimeError) as exc_info:
        await provider.query("agentguard-policies", "refund policy")

    assert "MOSS_MOCK_FALLBACK is disabled" in str(exc_info.value) or "silent" in str(exc_info.value)

    # State must now be degraded and disconnected
    assert provider.is_connected() is False
    assert provider.is_live_moss_connected() is False
    assert provider.get_mode() == "moss_degraded"

    # Subsequent query attempt must also fail immediately with clear degraded message
    with pytest.raises(RuntimeError) as exc_info2:
        await provider.query("agentguard-policies", "refund policy")
    assert "credit_exhausted" in str(exc_info2.value) or "degraded" in str(exc_info2.value)


@pytest.mark.asyncio
async def test_moss_credit_exhaustion_fallback_enabled():
    """
    When MOSS_MOCK_FALLBACK=true (fallback enabled):
    - Live Moss credit exhaustion / 429 error triggers fallback to local semantic engine.
    - Provider mode must explicitly report 'degraded_local', NEVER 'live_moss'.
    - is_connected() and is_live_moss_connected() must return False (live Moss is not connected).
    - Query returns valid results via local engine.
    """
    provider = MossRetrievalProvider(
        project_id="test_pid",
        project_key="test_pkey",
        allow_fallback=True,
    )

    # Pre-prime fallback provider with seed policies
    fallback = provider._get_fallback_provider()
    await fallback.create_index("agentguard-policies", format_policies_for_moss())
    await fallback.load_index("agentguard-policies")

    mock_client = MagicMock()
    mock_client.query = AsyncMock(
        side_effect=RuntimeError('HTTP 429 Too Many Requests: {"error":"USAGE_LIMIT_EXCEEDED","message":"credit_exhausted"}')
    )
    mock_client.load_index = AsyncMock(return_value=None)
    provider.client = mock_client
    provider._connected = True
    provider._loaded_indexes.add("agentguard-policies")

    # Execute query: should succeed via fallback without raising
    result = await provider.query("agentguard-policies", "refund customer $2000", top_k=3)
    assert len(result.docs) > 0

    # Operational state checks: must reflect degraded_local, NEVER live_moss
    assert provider.is_connected() is False
    assert provider.is_live_moss_connected() is False
    assert provider.get_mode() == "degraded_local"
    assert provider.get_mode() != "live_moss"


def test_health_endpoint_accurately_reports_degraded_and_fallback_states():
    """
    Verifies that /api/v1/health truthfully reflects moss_connected and active_mode
    for live_moss, degraded_local, and moss_degraded states.
    """
    client = TestClient(app)

    # 1. Fallback disabled, degraded
    degraded_provider = MossRetrievalProvider(
        project_id="p1",
        project_key="k1",
        allow_fallback=False,
    )
    degraded_provider._mark_degraded(RuntimeError("HTTP 429 USAGE_LIMIT_EXCEEDED credit_exhausted"))
    set_retrieval_provider(degraded_provider)

    res1 = client.get("/api/v1/health")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "ok"
    assert data1["moss_connected"] is False
    assert data1["active_mode"] == "moss_degraded"
    assert data1["active_mode"] != "live_moss"

    # Also check HEAD
    head_res1 = client.head("/api/v1/health")
    assert head_res1.status_code == 200

    # 2. Fallback enabled, degraded local
    fallback_provider = MossRetrievalProvider(
        project_id="p2",
        project_key="k2",
        allow_fallback=True,
    )
    fallback_provider._mark_degraded(RuntimeError("HTTP 429 USAGE_LIMIT_EXCEEDED credit_exhausted"))
    fallback_provider._fallback_active = True
    set_retrieval_provider(fallback_provider)

    res2 = client.get("/api/v1/health")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "ok"
    assert data2["moss_connected"] is False
    assert data2["active_mode"] == "degraded_local"
    assert data2["active_mode"] != "live_moss"

    # 3. Healthy live Moss
    healthy_provider = MossRetrievalProvider(
        project_id="p3",
        project_key="k3",
        allow_fallback=False,
    )
    healthy_provider._connected = True
    healthy_provider.client = MagicMock()
    set_retrieval_provider(healthy_provider)

    res3 = client.get("/api/v1/health")
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["status"] == "ok"
    assert data3["moss_connected"] is True
    assert data3["active_mode"] == "live_moss"


@pytest.mark.asyncio
async def test_graceful_startup_with_moss_credit_exhaustion():
    """
    Verifies requirement:
    'Preserve graceful application startup; the service should not crash just because Moss is temporarily unavailable.'
    """
    from app.main import lifespan

    # Test startup with fallback disabled when warmup fails
    mock_provider = MossRetrievalProvider(
        project_id="p_test",
        project_key="k_test",
        allow_fallback=False,
    )
    # Simulate warmup failure
    mock_provider.initialize = AsyncMock(
        side_effect=RuntimeError("HTTP 429 USAGE_LIMIT_EXCEEDED credit_exhausted")
    )

    with patch("app.main.get_retrieval_provider", return_value=mock_provider):
        # Lifespan must NOT raise an exception
        async with lifespan(app):
            # Probes remain operational
            assert mock_provider.is_connected() is False
            assert mock_provider.get_mode() == "moss_degraded"

