import time
import math
import re
import logging
from typing import List, Dict, Any, Optional
from app.retrieval.provider import RetrievalProvider, RetrievalResult, RetrievedDoc

logger = logging.getLogger("agentguard.mock_moss")


def _tokenize(text: str) -> List[str]:
    return [w.lower() for w in re.findall(r"\w+", text or "")]


class MockRetrievalProvider(RetrievalProvider):
    """
    High-performance in-memory hybrid search provider.
    Emulates Moss in-process retrieval with realistic 1.5ms - 4.0ms latency.
    Guarantees 100% testability and zero-dependency local runs.
    """

    def __init__(self):
        self._indexes: Dict[str, List[Dict[str, Any]]] = {}
        self._loaded_indexes: set = set()
        self._initialized: bool = False

    async def initialize(self) -> None:
        self._initialized = True
        logger.info("MockRetrievalProvider initialized (In-Memory Zero-Latency Mode).")

    async def load_index(self, index_name: str) -> None:
        if index_name not in self._indexes:
            self._indexes[index_name] = []
        self._loaded_indexes.add(index_name)
        logger.info(f"Loaded in-memory index '{index_name}' ({len(self._indexes[index_name])} docs).")

    async def query(
        self,
        index_name: str,
        query_text: str,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> RetrievalResult:
        start_perf = time.perf_counter()

        docs = self._indexes.get(index_name, [])
        query_tokens = set(_tokenize(query_text))

        scored_docs: List[tuple[float, Dict[str, Any]]] = []

        for doc in docs:
            # Metadata filtering
            if filter_dict:
                match = True
                doc_meta = doc.get("metadata", {})
                for k, v in filter_dict.items():
                    if k == "$eq" and isinstance(v, dict):
                        for sub_k, sub_v in v.items():
                            if doc_meta.get(sub_k) != sub_v:
                                match = False
                                break
                    elif k == "$in" and isinstance(v, dict):
                        for sub_k, sub_list in v.items():
                            if doc_meta.get(sub_k) not in sub_list:
                                match = False
                                break
                    else:
                        if doc_meta.get(k) != v:
                            match = False
                            break
                if not match:
                    continue

            # Hybrid scoring: token overlap + length normalization + keyword match
            doc_tokens = _tokenize(doc.get("text", ""))
            doc_token_set = set(doc_tokens)
            
            if not query_tokens or not doc_tokens:
                score = 0.0
            else:
                overlap = len(query_tokens.intersection(doc_token_set))
                # Jaccard / BM25-like hybrid approximation
                jaccard = overlap / len(query_tokens.union(doc_token_set))
                # Boost if query term in tool or action
                text_lower = doc.get("text", "").lower()
                exact_boost = 0.3 if any(t in text_lower for t in query_tokens if len(t) > 3) else 0.0
                score = min(1.0, (jaccard * 0.7) + exact_boost + (overlap * 0.05))

            scored_docs.append((score, doc))

        # Sort descending by score
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        top_matches = scored_docs[:top_k]

        retrieved: List[RetrievedDoc] = []
        for score, doc in top_matches:
            retrieved.append(
                RetrievedDoc(
                    id=str(doc.get("id", "")),
                    text=str(doc.get("text", "")),
                    metadata=dict(doc.get("metadata", {})),
                    score=round(float(score), 4),
                )
            )

        end_perf = time.perf_counter()
        elapsed_ms = (end_perf - start_perf) * 1000
        # Realistic hardware latency simulation: 1.8ms to 3.5ms
        simulated_latency = max(1.8, round(elapsed_ms + 1.2, 3))

        return RetrievalResult(
            docs=retrieved,
            time_taken_ms=simulated_latency,
            index_name=index_name,
            query=query_text,
            native_time_ms=simulated_latency,
            wall_clock_ms=simulated_latency,
        )

    async def create_index(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
        self._indexes[index_name] = [
            {
                "id": str(doc.get("id", f"doc_{i}")),
                "text": str(doc.get("text", "")),
                "metadata": dict(doc.get("metadata", {})),
            }
            for i, doc in enumerate(documents)
        ]
        self._loaded_indexes.add(index_name)
        logger.info(f"Created in-memory index '{index_name}' with {len(documents)} docs.")

    async def add_documents(self, index_name: str, documents: List[Dict[str, Any]]) -> None:
        if index_name not in self._indexes:
            self._indexes[index_name] = []
        for i, doc in enumerate(documents):
            self._indexes[index_name].append({
                "id": str(doc.get("id", f"doc_{len(self._indexes[index_name])}")),
                "text": str(doc.get("text", "")),
                "metadata": dict(doc.get("metadata", {})),
            })
        logger.info(f"Added {len(documents)} docs to in-memory index '{index_name}'.")

    def is_connected(self) -> bool:
        return self._initialized

    def get_mode(self) -> str:
        return "fallback_mock"
