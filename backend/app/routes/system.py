from fastapi import APIRouter

from app.services.system_stats import get_system_overview

router = APIRouter()


@router.get("")
@router.get("/")
def read_system_overview() -> dict:
    return get_system_overview()


@router.get("/stats")
def read_system_stats() -> dict:
    return get_system_overview()
