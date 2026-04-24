"""Retriever strategy registry.

Usage:
    from src.retrievers import register, get, list_available

    @register('hybrid')
    class HybridRetrieverStrategy(AbstractRetriever): ...

    retriever = get('hybrid')
    print(list_available())  # ['hybrid']
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import AbstractRetriever

_retrievers: dict[str, 'AbstractRetriever'] = {}


def register(name: str):
    """Decorator to register a retriever class under a name.

    Can be used as:
        @register('my-name')
        class MyRetriever(AbstractRetriever): ...

    Or imperatively:
        register('hybrid')(HybridRetriever)
    """
    def decorator(cls):
        instance = cls() if callable(cls) and isinstance(cls, type) else cls
        _retrievers[name] = instance
        return cls
    return decorator


def register_instance(name: str, retriever: 'AbstractRetriever') -> None:
    """Register an already-instantiated retriever."""
    _retrievers[name] = retriever


def get(name: str) -> 'AbstractRetriever':
    """Return the retriever registered under name.

    Raises:
        KeyError: if name is not registered.
    """
    if name not in _retrievers:
        raise KeyError(f"No retriever registered as '{name}'. Available: {list_available()}")
    return _retrievers[name]


def list_available() -> list[str]:
    """Return names of all registered retrievers."""
    return list(_retrievers.keys())
