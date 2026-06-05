from __future__ import annotations

import os
import platform
import socket
import time
from datetime import datetime, timezone

import psutil


def _bytes_to_gib(value: int) -> float:
    return round(value / (1024**3), 2)


def _format_duration(seconds: float) -> str:
    seconds = int(seconds)
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)

    parts = []
    if days:
        parts.append(f"{days}d")
    if hours or days:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


def _network_interfaces() -> list[dict]:
    interfaces = []
    counters = psutil.net_io_counters(pernic=True)

    for name, addresses in psutil.net_if_addrs().items():
        ipv4_addresses = [
            address.address
            for address in addresses
            if getattr(address, "family", None) == socket.AF_INET
        ]
        stats = counters.get(name)

        interfaces.append(
            {
                "name": name,
                "ipv4": ipv4_addresses,
                "bytes_sent": stats.bytes_sent if stats else 0,
                "bytes_recv": stats.bytes_recv if stats else 0,
                "packets_sent": stats.packets_sent if stats else 0,
                "packets_recv": stats.packets_recv if stats else 0,
            }
        )

    return interfaces


def get_system_overview() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot_time = psutil.boot_time()
    load_average = os.getloadavg() if hasattr(os, "getloadavg") else (0.0, 0.0, 0.0)

    return {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": {
            "percent": psutil.cpu_percent(interval=0.1),
            "cores_physical": psutil.cpu_count(logical=False),
            "cores_logical": psutil.cpu_count(logical=True),
            "load_average": {
                "one": round(load_average[0], 2),
                "five": round(load_average[1], 2),
                "fifteen": round(load_average[2], 2),
            },
        },
        "memory": {
            "total_gib": _bytes_to_gib(memory.total),
            "used_gib": _bytes_to_gib(memory.used),
            "available_gib": _bytes_to_gib(memory.available),
            "percent": memory.percent,
        },
        "disk": {
            "mount": "/",
            "total_gib": _bytes_to_gib(disk.total),
            "used_gib": _bytes_to_gib(disk.used),
            "free_gib": _bytes_to_gib(disk.free),
            "percent": disk.percent,
        },
        "uptime": {
            "boot_time": datetime.fromtimestamp(boot_time, timezone.utc).isoformat(),
            "seconds": int(time.time() - boot_time),
            "display": _format_duration(time.time() - boot_time),
        },
        "network": {
            "interfaces": _network_interfaces(),
            "total": psutil.net_io_counters()._asdict(),
        },
    }
