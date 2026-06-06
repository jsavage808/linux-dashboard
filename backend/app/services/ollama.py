from __future__ import annotations

import json
import os
import time
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
            "capabilities": model.get("capabilities", []),
        }
        for model in models
        if isinstance(model, dict) and model.get("name")
    ]


async def stream_chat(model: str, messages: list[dict[str, str]]) -> AsyncIterator[dict[str, Any]]:
    payload = {"model": model, "messages": messages, "stream": True}
    started_at = time.perf_counter()

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
                        yield {"type": "error", "message": f"Ollama error: {chunk['error']}"}
                        return

                    content = chunk.get("message", {}).get("content")
                    if content:
                        yield {"type": "content", "content": content}
                    if chunk.get("done"):
                        elapsed = time.perf_counter() - started_at
                        eval_count = chunk.get("eval_count")
                        eval_duration = chunk.get("eval_duration")
                        tokens_per_second = None
                        if eval_count and eval_duration:
                            eval_seconds = eval_duration / 1_000_000_000
                            if eval_seconds > 0:
                                tokens_per_second = round(eval_count / eval_seconds, 2)

                        total_duration = chunk.get("total_duration")
                        response_time = (
                            round(total_duration / 1_000_000_000, 2)
                            if total_duration
                            else round(elapsed, 2)
                        )
                        yield {
                            "type": "metrics",
                            "metrics": {
                                "response_time_seconds": response_time,
                                "tokens_per_second": tokens_per_second,
                                "model": model,
                            },
                        }
                        return
    except httpx.HTTPError as exc:
        yield {"type": "error", "message": f"Ollama connection error: {exc}"}
