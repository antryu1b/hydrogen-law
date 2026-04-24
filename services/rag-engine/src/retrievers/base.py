"""Abstract retriever base class"""

from abc import ABC, abstractmethod
from typing import Any

from ..domain.law import Citation


class AbstractRetriever(ABC):
    """Base class for all retrieval strategies.

    Register a new strategy via:
        from src.retrievers import register
        @register('my-strategy')
        class MyRetriever(AbstractRetriever): ...
    """

    name: str

    @abstractmethod
    def search(self, query: str, top_k: int) -> list[dict[str, Any]]:
        """Execute search and return raw result dicts compatible with HybridRetriever output."""
        ...
