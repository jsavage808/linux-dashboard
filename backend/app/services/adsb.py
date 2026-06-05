from __future__ import annotations

import math
import os
from typing import Any

import httpx

DEFAULT_ADSB_URLS = [
    "http://host.docker.internal:8080/data/aircraft.json",
    "http://host.docker.internal:8080/dump1090-fa/data/aircraft.json",
    "http://host.docker.internal:8080/tar1090/data/aircraft.json",
    "http://127.0.0.1:8080/data/aircraft.json",
    "http://127.0.0.1:8080/dump1090-fa/data/aircraft.json",
    "http://127.0.0.1:8080/tar1090/data/aircraft.json",
]


def _float_or_none(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _receiver_position(payload: dict[str, Any] | None = None) -> dict[str, float] | None:
    lat = _float_or_none(os.getenv("ADSB_RECEIVER_LAT"))
    lon = _float_or_none(os.getenv("ADSB_RECEIVER_LON"))
    if (lat is None or lon is None) and payload:
        lat = _float_or_none(payload.get("lat"))
        lon = _float_or_none(payload.get("lon"))
    if lat is None or lon is None:
        return None
    return {"lat": lat, "lon": lon}


def _distance_nm(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    radius_nm = 3440.065
    phi_a = math.radians(lat_a)
    phi_b = math.radians(lat_b)
    delta_phi = math.radians(lat_b - lat_a)
    delta_lambda = math.radians(lon_b - lon_a)

    haversine = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    )
    return round(radius_nm * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine)), 1)


def _candidate_urls() -> list[str]:
    configured_url = os.getenv("ADSB_JSON_URL")
    if configured_url:
        return [configured_url, *DEFAULT_ADSB_URLS]
    return DEFAULT_ADSB_URLS


async def _fetch_aircraft_json() -> tuple[str, dict[str, Any]] | None:
    timeout = httpx.Timeout(2.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for url in _candidate_urls():
            try:
                response = await client.get(url)
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError):
                continue
            if isinstance(payload, dict) and isinstance(payload.get("aircraft"), list):
                return url, payload
    return None


def _normalize_aircraft(record: dict[str, Any], receiver: dict[str, float] | None) -> dict[str, Any]:
    lat = _float_or_none(record.get("lat"))
    lon = _float_or_none(record.get("lon"))
    distance_nm = None
    if receiver and lat is not None and lon is not None:
        distance_nm = _distance_nm(receiver["lat"], receiver["lon"], lat, lon)

    return {
        "hex": record.get("hex"),
        "callsign": (record.get("flight") or record.get("r") or "").strip() or "Unknown",
        "altitude": record.get("alt_baro") or record.get("alt_geom"),
        "speed": record.get("gs") or record.get("ias") or record.get("tas"),
        "heading": record.get("track") or record.get("mag_heading") or record.get("true_heading"),
        "lat": lat,
        "lon": lon,
        "distance_nm": distance_nm,
        "seen": record.get("seen"),
    }


async def get_aircraft_snapshot() -> dict[str, Any]:
    result = await _fetch_aircraft_json()

    if result is None:
        return {
            "service_available": False,
            "source": None,
            "receiver": _receiver_position(),
            "aircraft": [],
            "message": "No local readsb/dump1090 JSON endpoint responded.",
        }

    source, payload = result
    receiver = _receiver_position(payload)
    aircraft = [
        _normalize_aircraft(record, receiver)
        for record in payload.get("aircraft", [])
        if isinstance(record, dict)
    ]

    return {
        "service_available": True,
        "source": source,
        "receiver": receiver,
        "now": payload.get("now"),
        "total": len(aircraft),
        "aircraft": aircraft,
    }
