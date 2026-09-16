import pytest
from app.retrieval.mock_client import MockRetrievalProvider
from app.engine.benchmark import BenchmarkRunner
from app.data.seed_policies import format_policies_for_moss


@pytest.mark.asyncio
async def test_benchmark_runner():
    provider = MockRetrievalProvider()
    await provider.initialize()
    docs = format_policies_for_moss()
    await provider.create_index("agentguard-policies", docs)
    await provider.load_index("agentguard-policies")

    runner = BenchmarkRunner(provider=provider)
    res = await runner.run_benchmark(iterations=10, warmup=2)

    assert res.total_queries == 10
    assert res.moss.mean_ms < 10.0  # Sub-10ms requirement
    assert res.moss.p50_ms < 10.0
    assert res.remote_vector_db.mean_ms > 200.0  # Remote DB is much slower
    assert res.speedup_factor > 10.0  # Significant speedup
