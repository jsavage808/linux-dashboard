from fastapi import APIRouter

from app.services.adsb import get_aircraft_snapshot

router = APIRouter()


@router.get("/aircraft")
async def read_aircraft() -> dict:
    return await get_aircraft_snapshot()
