import time
import logging
from typing import List, Dict, Any, Optional
from moss import MossClient, QueryOptions, DocumentInfo, SearchResult
from app.retrieval.provider import RetrievalProvider, RetrievalResult, RetrievedDoc

logger = logging.getLogger("agentguard.moss")


class MossRetrievalProvider(RetrievalProvider):
    """
    Production Retrieval Provider embedding the official Moss SDK runtime.
    Delivers sub-10ms in-process hybrid search.
    """

    def __init__(self, project_id: str, project_key: str):
        self.project_id = project_id
        self.project_key = project_key
        self.client: Optional[MossClient] = None
        self._connected: bool = False
        self._loaded_indexes: set = set()

    async def initialize(self) -> None:
        try:
            logger.info("Initializing live MossClient connection...")
            self.client = MossClient(self.project_id, self.project_key)
            self._connected = True
            logger.info("MossClient successfully initialized.")
        except Exception as e:
            self._connected = False
            logger.error(f"Failed to initialize MossClient: {e}", exc_info=True)
            raise

    async def load_index(self, index_name: str) -> None:
        if not self.client:
            await self.initialize()

        start_time = time.perf_counter()
        logger.info(f"Warming up and loading Moss index '{index_name}' into process memory...")
        try:
            await self.client.load_index(index_name)
            self._loaded_indexes.add(index_name)
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Loaded Moss index '{index_name}' in {duration_ms:.2f}ms")
        except Exception as e:
            logger.warning(f"Could not load index '{index_name}' (it may need creation first): {e}")

    async def query(
        self,
        index_name: str,
        query_text: str,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> RetrievalResult:
        if not self.client:
            await self.initialize()

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
            logger.error(f"Error executing Moss query on index '{index_name}': {e}", exc_info=True)
            raise

    async def create_index(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
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

        logger.info(f"Creating Moss index '{index_name}' with {len(doc_infos)} documents...")
        await self.client.create_index(index_name, doc_infos)
        await self.load_index(index_name)

    async def add_documents(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
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

        logger.info(f"Adding {len(doc_infos)} documents to Moss index '{index_name}'...")
        await self.client.add_docs(index_name, doc_infos)

    def is_connected(self) -> bool:
        return self._connected and self.client is not None

    def get_mode(self) -> str:
        return "live_moss"
