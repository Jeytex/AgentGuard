from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class RetrievedDoc(BaseModel):
    id: str
    text: str
    metadata: Dict[str, Any] = {}
    score: float = 0.0


class RetrievalResult(BaseModel):
    docs: List[RetrievedDoc]
    time_taken_ms: float
    index_name: str
    query: str
    native_time_ms: Optional[float] = None
    wall_clock_ms: Optional[float] = None



class RetrievalProvider(ABC):
    """Abstract interface for sub-10ms policy and incident retrieval."""

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize connection or warm up indexes."""
        pass

    @abstractmethod
    async def load_index(self, index_name: str) -> None:
        """Load index into process memory for sub-10ms queries."""
        pass

    @abstractmethod
    async def query(
        self,
        index_name: str,
        query_text: str,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> RetrievalResult:
        """Execute hybrid search on loaded in-memory index."""
        pass

    @abstractmethod
    async def create_index(
        self, index_name: str, documents: List[Dict[str, Any]]
    ) -> None:
        """Create or replace an index with documents."""
        pass

    @abstractmethod
    async def add_documents(
        self, index_name: str, documents: List[Dict[str, Any]]
    ) -> None:
        """Append documents to an existing index."""
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Check if provider is initialized and operational."""
        pass

    def is_live_moss_connected(self) -> bool:
        """Check specifically if live Moss cloud service is connected and healthy."""
        return False

    @abstractmethod
    def get_mode(self) -> str:
        """Return 'live_moss', 'fallback_mock', 'degraded_local', or 'moss_degraded'."""
        pass


_global_provider: Optional[RetrievalProvider] = None


def get_retrieval_provider() -> RetrievalProvider:
    global _global_provider
    if _global_provider is not None:
        return _global_provider

    from app.config import settings
    from app.retrieval.mock_client import MockRetrievalProvider
    from app.retrieval.moss_client import MossRetrievalProvider

    if settings.MOSS_PROJECT_ID and settings.MOSS_PROJECT_KEY:
        try:
            _global_provider = MossRetrievalProvider(
                project_id=settings.MOSS_PROJECT_ID,
                project_key=settings.MOSS_PROJECT_KEY,
                allow_fallback=settings.MOSS_MOCK_FALLBACK,
            )
            return _global_provider
        except Exception:
            if settings.MOSS_MOCK_FALLBACK:
                _global_provider = MockRetrievalProvider()
                return _global_provider
            raise
    else:
        _global_provider = MockRetrievalProvider()
        return _global_provider


def set_retrieval_provider(provider: Optional[RetrievalProvider]) -> None:
    global _global_provider
    _global_provider = provider


def reset_retrieval_provider() -> None:
    global _global_provider
    _global_provider = None

