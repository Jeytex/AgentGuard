import pytest
from app.retrieval.mock_client import MockRetrievalProvider
from app.data.seed_policies import format_policies_for_moss


@pytest.mark.asyncio
async def test_mock_retrieval_provider_lifecycle():
    provider = MockRetrievalProvider()
    await provider.initialize()
    assert provider.is_connected() is True
    assert provider.get_mode() == "fallback_mock"

    # Index seed policies
    policies = format_policies_for_moss()
    assert len(policies) > 0

    await provider.create_index("test-policies", policies)
    await provider.load_index("test-policies")

    # Query financial policy
    res = await provider.query("test-policies", "refund customer $2000", top_k=3)
    assert len(res.docs) > 0
    assert res.time_taken_ms < 10.0  # Must be sub-10ms
    assert res.index_name == "test-policies"

    # Check top match has relevant content
    top_doc = res.docs[0]
    assert "refund" in top_doc.text.lower() or "financial" in str(top_doc.metadata).lower()


@pytest.mark.asyncio
async def test_metadata_filtering():
    provider = MockRetrievalProvider()
    await provider.initialize()

    docs = [
        {"id": "d1", "text": "Stripe refund policy", "metadata": {"category": "financial"}},
        {"id": "d2", "text": "Postgres database table drop", "metadata": {"category": "destructive"}},
        {"id": "d3", "text": "Customer SSN export", "metadata": {"category": "pii"}},
    ]
    await provider.create_index("filter-test", docs)

    # Filter for destructive category
    res = await provider.query("filter-test", "action policy", top_k=3, filter_dict={"category": "destructive"})
    assert len(res.docs) == 1
    assert res.docs[0].id == "d2"
    assert res.docs[0].metadata["category"] == "destructive"
