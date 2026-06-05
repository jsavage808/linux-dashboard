from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx


class OllamaConnectionError(RuntimeError):
    pass


def _ollama_base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


async def list_models() -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{_ollama_base_url()}/api/tags")
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise OllamaConnectionError(
            "Ollama is not reachable. Start Ollama and confirm it is listening on port 11434."
        ) from exc

    models = payload.get("models", [])
    if not isinstance(models, list):
        return []

    return [
        {
            "name": model.get("name"),
            "modified_at": model.get("modified_at"),
            "size": model.get("size"),
        }
        for model in models
        if isinstance(model, dict) and model.get("name")
    ]


async def stream_chat(model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
    payload = {"model": model, "messages": messages, "stream": True}

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{_ollama_base_url()}/api/chat",
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if chunk.get("error"):
                        yield f"\n\n[Ollama error: {chunk['error']}]\n"
                        return

                    content = chunk.get("message", {}).get("content")
                    if content:
                        yield content
                    if chunk.get("done"):
                        return
    except httpx.HTTPError as exc:
        yield f"\n\n[Ollama connection error: {exc}]\n"
