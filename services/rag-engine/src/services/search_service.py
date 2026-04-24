"""
Search service — wraps HybridRetriever with startup/init logic.

Extracted from main.py to keep the FastAPI entry point thin.
"""

import logging
import os
from typing import Optional

import chromadb

from ..embeddings import KoreanEmbedder, VectorStore
from ..retrieval import HybridRetriever
from ..retrievers.registry import register_instance

logger = logging.getLogger(__name__)


class SearchService:
    """Manages retriever lifecycle and exposes a search method."""

    def __init__(self) -> None:
        self.embedder: Optional[KoreanEmbedder] = None
        self.vector_store: Optional[VectorStore] = None
        self.retriever: Optional[HybridRetriever] = None

    def initialize(self, base_dir: str) -> None:
        """Load embedder, documents, and build BM25 index.

        Args:
            base_dir: directory containing chroma_db/ and law_documents.json
        """
        # 1. Embedding model
        try:
            self.embedder = KoreanEmbedder()
            logger.info("Embedding model loaded")
        except Exception as exc:
            self.embedder = None
            logger.warning("Embedding model load failed, switching to BM25-only mode: %s", exc)

        # 2. Load documents
        documents, total_docs = self._load_documents(base_dir)

        # 3. Build retriever
        if self.vector_store is not None:
            self.retriever = HybridRetriever(self.vector_store)
        else:
            self.retriever = HybridRetriever.__new__(HybridRetriever)
            self.retriever.vector_store = None
            self.retriever.vector_weight = 0.0
            self.retriever.bm25_weight = 1.0
            self.retriever.bm25_index = None
            self.retriever.documents = []
            self.retriever.document_ids = []

        self.retriever.build_bm25_index(documents)

        # 4. Register in retriever registry
        register_instance('hybrid', self.retriever)

        mode = "hybrid (vector + BM25)" if self.embedder else "BM25-only"
        logger.info("SearchService ready: %d documents, mode=%s", total_docs, mode)

    def search(self, query: str, top_k: int = 10, filters=None):
        """Delegate to the underlying HybridRetriever."""
        if self.retriever is None:
            raise RuntimeError("SearchService not initialized — call initialize() first")
        return self.retriever.search(query, top_k=top_k, filters=filters)

    def rebuild_bm25(self) -> None:
        """Rebuild BM25 index after new documents are added."""
        if self.vector_store is None or self.retriever is None:
            return
        stats = self.vector_store.get_stats()
        total_docs = stats["total_documents"]
        documents = self._load_from_chroma(self.vector_store.collection, total_docs)
        self.retriever.build_bm25_index(documents)

    def _load_documents(self, base_dir: str):
        """Load documents from ChromaDB or JSON fallback."""
        chroma_dir = os.path.join(base_dir, "chroma_db")
        documents = []
        total_docs = 0

        if self.embedder is not None:
            self.vector_store = VectorStore(
                collection_name="hydrogen_law", embedder=self.embedder
            )
            documents, total_docs = self._load_from_chroma_with_count(
                self.vector_store.collection
            )
        else:
            try:
                chroma_client = chromadb.PersistentClient(
                    path=chroma_dir,
                    settings=chromadb.Settings(
                        anonymized_telemetry=False, allow_reset=True
                    ),
                )
                collection = chroma_client.get_or_create_collection(
                    name="hydrogen_law",
                    metadata={"description": "수소 관련 법령 벡터 데이터베이스"},
                )
                documents, total_docs = self._load_from_chroma_with_count(collection)
            except Exception as exc:
                logger.warning("ChromaDB load failed: %s", exc)

        if not documents:
            import json as json_mod
            json_path = os.path.join(base_dir, "law_documents.json")
            if os.path.exists(json_path):
                with open(json_path, "r", encoding="utf-8") as f:
                    documents = json_mod.load(f)
                total_docs = len(documents)
                logger.info("Loaded %d documents from JSON file", total_docs)
            else:
                logger.warning("No document source found")

        return documents, total_docs

    @staticmethod
    def _load_from_chroma_with_count(collection, batch_size: int = 500):
        total_docs = collection.count()
        documents = SearchService._load_from_chroma(collection, total_docs, batch_size)
        return documents, total_docs

    @staticmethod
    def _load_from_chroma(collection, total_docs: int, batch_size: int = 500):
        documents = []
        offset = 0
        while offset < total_docs:
            result = collection.get(
                limit=batch_size,
                offset=offset,
                include=["documents", "metadatas"],
            )
            if not result["documents"]:
                break
            for doc, meta in zip(result["documents"], result["metadatas"]):
                documents.append(
                    {"id": meta.get("chunk_id", ""), "content": doc, "metadata": meta}
                )
            offset += batch_size
        return documents
