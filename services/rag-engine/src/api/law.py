"""GET /laws and GET /laws/{id}"""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/laws")
async def list_laws():
    """List collected laws"""
    # H3 target: will query config + DB
    return {"total_laws": 0, "laws": []}


@router.get("/laws/{law_id}")
async def get_law_detail(law_id: str):
    """Get law detail by ID"""
    # H3 target: will query DB
    raise HTTPException(status_code=404, detail="법령을 찾을 수 없습니다")
