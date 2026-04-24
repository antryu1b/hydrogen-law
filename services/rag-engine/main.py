"""
수소법률 RAG 엔진 — FastAPI entry point

Slim: init + mount routers only.
Business logic lives in src/services/, routes in src/api/.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api import health_router, search_router, law_router, compliance_router, upload_router
from src.services import SearchService

logger = logging.getLogger(__name__)

_search_service = SearchService()

app = FastAPI(
    title="수소법률 RAG 엔진",
    description="국가법령정보센터 기반 수소 관련 법률 검색 시스템",
    version="1.0.0",
)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(search_router)
app.include_router(law_router)
app.include_router(compliance_router)
app.include_router(upload_router)


@app.on_event("startup")
async def startup_event():
    base_dir = os.path.dirname(__file__)
    _search_service.initialize(base_dir)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
