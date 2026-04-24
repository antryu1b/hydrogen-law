"""Retriever registry — register / get / list tests"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from src.retrievers.registry import register, register_instance, get, list_available, _retrievers
from src.retrievers.base import AbstractRetriever


class _DummyRetriever(AbstractRetriever):
    name = 'dummy'

    def search(self, query: str, top_k: int):
        return [{'id': 'doc1', 'content': 'dummy result', 'metadata': {}}]


class _AnotherRetriever(AbstractRetriever):
    name = 'another'

    def search(self, query: str, top_k: int):
        return []


class TestRetrieverRegistry:
    def setup_method(self):
        """Clear registry before each test."""
        _retrievers.clear()

    def test_register_instance(self):
        dummy = _DummyRetriever()
        register_instance('dummy', dummy)
        assert 'dummy' in list_available()

    def test_get_registered(self):
        dummy = _DummyRetriever()
        register_instance('dummy', dummy)
        retrieved = get('dummy')
        assert retrieved is dummy

    def test_get_unregistered_raises(self):
        with pytest.raises(KeyError, match="No retriever registered"):
            get('nonexistent')

    def test_list_available_empty(self):
        assert list_available() == []

    def test_list_available_multiple(self):
        register_instance('dummy', _DummyRetriever())
        register_instance('another', _AnotherRetriever())
        available = list_available()
        assert 'dummy' in available
        assert 'another' in available
        assert len(available) == 2

    def test_register_decorator(self):
        @register('decorated')
        class DecoratedRetriever(AbstractRetriever):
            name = 'decorated'
            def search(self, query, top_k):
                return []
        assert 'decorated' in list_available()

    def test_register_overwrites(self):
        dummy1 = _DummyRetriever()
        dummy2 = _DummyRetriever()
        register_instance('dummy', dummy1)
        register_instance('dummy', dummy2)
        assert get('dummy') is dummy2

    def test_search_returns_results(self):
        register_instance('dummy', _DummyRetriever())
        retriever = get('dummy')
        results = retriever.search('test query', top_k=5)
        assert isinstance(results, list)
        assert len(results) == 1
        assert results[0]['id'] == 'doc1'
