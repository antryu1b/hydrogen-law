"""GET /health and GET /"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def root():
    """Health check"""
    return {
        "status": "healthy",
        "service": "수소법률 RAG 엔진",
        "version": "1.0.0",
        "llm_mode": "minimal (90% search, 10% optional)",
    }


@router.get("/health")
async def health_check():
    """Service health status"""
    return {
        "status": "healthy",
        "dependencies": {
            "vector_db": "not_initialized",
            "embedding_model": "not_loaded",
            "law_database": "not_connected",
        },
    }
