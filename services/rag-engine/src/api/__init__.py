"""FastAPI routers"""

from .health import router as health_router
from .search import router as search_router
from .law import router as law_router
from .compliance import router as compliance_router
from .upload import router as upload_router

__all__ = ['health_router', 'search_router', 'law_router', 'compliance_router', 'upload_router']
