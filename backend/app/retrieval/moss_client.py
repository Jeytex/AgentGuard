import time
import logging
from typing import List, Dict, Any, Optional
from moss import MossClient, QueryOptions, DocumentInfo, SearchResult
from app.retrieval.provider import RetrievalProvider, RetrievalResult, RetrievedDoc

logger = logging.getLogger("agentguard.moss")


class MossRetrievalProvider(RetrievalProvider):
    """
    Production Retrieval Provider embedding the official Moss SDK runtime.
    Delivers sub-10ms in-process hybrid search when connected.
    Accurately reports live, degraded, and fallback operational states.
    """

    def __init__(
        self,
        project_id: str,
        project_key: str,
        allow_fallback: Optional[bool] = None,
    ):
        self.project_id = project_id
        self.project_key = project_key
        if allow_fallback is None:
            from app.config import settings
            self.allow_fallback = settings.MOSS_MOCK_FALLBACK
        else:
            self.allow_fallback = allow_fallback

        self.client: Optional[MossClient] = None
        self._connected: bool = False
        self._degraded: bool = False
        self._degraded_reason: Optional[str] = None
        self._fallback_active: bool = False
        self._loaded_indexes: set = set()
        self._fallback_provider: Optional[RetrievalProvider] = None

    def _get_fallback_provider(self) -> RetrievalProvider:
        if self._fallback_provider is None:
            from app.retrieval.mock_client import MockRetrievalProvider
            self._fallback_provider = MockRetrievalProvider()
        return self._fallback_provider

    def _mark_degraded(self, e: Exception) -> None:
        self._connected = False
        self._degraded = True
        err_str = str(e)
        if "credit_exhausted" in err_str.lower() or "usage_limit_exceeded" in err_str.lower() or "429" in err_str:
            self._degraded_reason = "credit_exhausted"
        else:
            self._degraded_reason = err_str
        logger.warning(
            "Live Moss provider transitioned to DEGRADED state (reason: %s). Fallback allowed: %s",
            self._degraded_reason,
            self.allow_fallback,
        )

    async def initialize(self) -> None:
        try:
            logger.info("Initializing live MossClient connection...")
            self.client = MossClient(self.project_id, self.project_key)
            self._connected = True
            self._degraded = False
            self._degraded_reason = None
            logger.info("MossClient successfully initialized.")
        except Exception as e:
            self._mark_degraded(e)
            if not self.allow_fallback:
                raise

    async def load_index(self, index_name: str) -> None:
        if self._degraded and not self.allow_fallback:
            raise RuntimeError(
                f"Live Moss index '{index_name}' cannot be loaded: provider is degraded ({self._degraded_reason}). "
                "MOSS_MOCK_FALLBACK is false."
            )
        if self._degraded and self.allow_fallback:
            fallback = self._get_fallback_provider()
            await fallback.load_index(index_name)
            return

        if not self.client:
            await self.initialize()

        start_time = time.perf_counter()
        logger.info("Warming up and loading Moss index '%s' into process memory...", index_name)
        try:
            await self.client.load_index(index_name)
            self._loaded_indexes.add(index_name)
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info("Loaded Moss index '%s' in %.2fms", index_name, duration_ms)
        except Exception as e:
            self._mark_degraded(e)
            if self.allow_fallback:
                logger.warning("Could not load live Moss index '%s': %s. Priming local fallback.", index_name, e)
                fallback = self._get_fallback_provider()
                await fallback.load_index(index_name)
            else:
                raise

    async def query(
        self,
        index_name: str,
        query_text: str,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> RetrievalResult:
        if self._degraded:
            if not self.allow_fallback:
                raise RuntimeError(
                    f"Live Moss retrieval failed: service is in degraded state ({self._degraded_reason}). "
                    "MOSS_MOCK_FALLBACK is disabled (MOSS_MOCK_FALLBACK=false); silent fallback is prohibited."
                )
            self._fallback_active = True
            fallback = self._get_fallback_provider()
            return await fallback.query(
                index_name=index_name,
                query_text=query_text,
                top_k=top_k,
                filter_dict=filter_dict,
            )

        if not self.client:
            try:
                await self.initialize()
            except Exception as e:
                self._mark_degraded(e)
                if not self.allow_fallback:
                    raise RuntimeError(
                        f"Live Moss client initialization failed: {e}. "
                        "MOSS_MOCK_FALLBACK is disabled."
                    )
                self._fallback_active = True
                fallback = self._get_fallback_provider()
                return await fallback.query(
                    index_name=index_name,
                    query_text=query_text,
                    top_k=top_k,
                    filter_dict=filter_dict,
                )

        if index_name not in self._loaded_indexes:
            try:
                await self.load_index(index_name)
            except Exception as e:
                self._mark_degraded(e)
                if not self.allow_fallback:
                    raise RuntimeError(
                        f"Live Moss index '{index_name}' is not loaded: {e}. "
                        "MOSS_MOCK_FALLBACK is disabled."
                    )
                self._fallback_active = True
                fallback = self._get_fallback_provider()
                return await fallback.query(
                    index_name=index_name,
                    query_text=query_text,
                    top_k=top_k,
                    filter_dict=filter_dict,
                )

        start_perf = time.perf_counter()
        options = QueryOptions(top_k=top_k, filter=filter_dict) if filter_dict else QueryOptions(top_k=top_k)

        try:
            search_result: SearchResult = await self.client.query(index_name, query_text, options)
            end_perf = time.perf_counter()
            wall_clock_ms = (end_perf - start_perf) * 1000

            # Extract native Moss Rust/C execution timer (integer ms, 0 means sub-millisecond)
            raw_native_ms = getattr(search_result, "time_taken_ms", None)
            native_ms = float(raw_native_ms) if raw_native_ms is not None and raw_native_ms >= 0 else None

            # time_ms defaults to native execution timer if available, otherwise wall clock
            time_ms = native_ms if native_ms is not None else wall_clock_ms

            retrieved_docs: List[RetrievedDoc] = []
            if hasattr(search_result, "docs") and search_result.docs:
                for doc in search_result.docs:
                    retrieved_docs.append(
                        RetrievedDoc(
                            id=str(getattr(doc, "id", "")),
                            text=str(getattr(doc, "text", "")),
                            metadata=dict(getattr(doc, "metadata", {}) or {}),
                            score=float(getattr(doc, "score", 0.0) or 0.0),
                        )
                    )

            return RetrievalResult(
                docs=retrieved_docs,
                time_taken_ms=round(float(time_ms), 3),
                index_name=index_name,
                query=query_text,
                native_time_ms=native_ms,
                wall_clock_ms=round(float(wall_clock_ms), 3),
            )
        except Exception as e:
            self._mark_degraded(e)
            if not self.allow_fallback:
                logger.error(
                    "Live Moss query failed on index '%s': %s. MOSS_MOCK_FALLBACK=false; silent fallback disabled.",
                    index_name,
                    e,
                )
                raise RuntimeError(
                    f"Live Moss query failed: {e}. MOSS_MOCK_FALLBACK is disabled; silent local fallback is prohibited."
                )
            logger.warning(
                "Error executing Moss query on index '%s': %s. Routing to local fallback provider.",
                index_name,
                e,
            )
            self._fallback_active = True
            fallback = self._get_fallback_provider()
            return await fallback.query(
                index_name=index_name,
                query_text=query_text,
                top_k=top_k,
                filter_dict=filter_dict,
            )

    async def create_index(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
        if self._degraded and not self.allow_fallback:
            raise RuntimeError(
                f"Cannot create index on live Moss: provider is degraded ({self._degraded_reason}). "
                "MOSS_MOCK_FALLBACK is false."
            )
        if self._degraded and self.allow_fallback:
            self._fallback_active = True
            fallback = self._get_fallback_provider()
            await fallback.create_index(index_name, documents)
            return

        if not self.client:
            await self.initialize()

        doc_infos = [
            DocumentInfo(
                id=str(doc.get("id", f"doc_{i}")),
                text=str(doc.get("text", "")),
                metadata=dict(doc.get("metadata", {})),
            )
            for i, doc in enumerate(documents)
        ]

        logger.info("Creating Moss index '%s' with %d documents...", index_name, len(doc_infos))
        try:
            await self.client.create_index(index_name, doc_infos)
            await self.load_index(index_name)
        except Exception as e:
            self._mark_degraded(e)
            if self.allow_fallback:
                self._fallback_active = True
                logger.warning(
                    "Could not create live Moss index '%s': %s. Ingesting into local fallback provider.",
                    index_name,
                    e,
                )
                fallback = self._get_fallback_provider()
                await fallback.create_index(index_name, documents)
            else:
                logger.error(
                    "Could not create live Moss index '%s': %s. MOSS_MOCK_FALLBACK is false.",
                    index_name,
                    e,
                )
                raise

    async def add_documents(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
        if self._degraded and not self.allow_fallback:
            raise RuntimeError(
                f"Cannot add documents to live Moss: provider is degraded ({self._degraded_reason}). "
                "MOSS_MOCK_FALLBACK is false."
            )
        if self._degraded and self.allow_fallback:
            self._fallback_active = True
            fallback = self._get_fallback_provider()
            await fallback.add_documents(index_name, documents)
            return

        if not self.client:
            await self.initialize()

        doc_infos = [
            DocumentInfo(
                id=str(doc.get("id", f"doc_{i}")),
                text=str(doc.get("text", "")),
                metadata=dict(doc.get("metadata", {})),
            )
            for i, doc in enumerate(documents)
        ]

        logger.info("Adding %d documents to Moss index '%s'...", len(doc_infos), index_name)
        try:
            await self.client.add_docs(index_name, doc_infos)
        except Exception as e:
            self._mark_degraded(e)
            if self.allow_fallback:
                self._fallback_active = True
                logger.warning(
                    "Could not add documents to live Moss index '%s': %s. Adding to local fallback provider.",
                    index_name,
                    e,
                )
                fallback = self._get_fallback_provider()
                await fallback.add_documents(index_name, documents)
            else:
                logger.error(
                    "Could not add documents to live Moss index '%s': %s. MOSS_MOCK_FALLBACK is false.",
                    index_name,
                    e,
                )
                raise

    def is_connected(self) -> bool:
        """Returns True only when live Moss client is active and not degraded."""
        return self._connected and not self._degraded and self.client is not None

    def is_live_moss_connected(self) -> bool:
        """Truthful indicator of whether live Moss cloud service is connected and healthy."""
        return self._connected and not self._degraded and self.client is not None

    def get_mode(self) -> str:
        """
        Explicitly surfaces:
        - 'live_moss': live Moss cloud service is healthy and servicing queries.
        - 'degraded_local': live Moss encountered an error, running on permitted local fallback.
        - 'moss_degraded': live Moss encountered an error and fallback is disabled.
        """
        if self._degraded or self._fallback_active:
            return "degraded_local" if self.allow_fallback else "moss_degraded"
        return "live_moss"

