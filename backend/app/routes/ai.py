from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.chat_store import create_chat as store_create_chat
from app.services.chat_store import delete_chat as store_delete_chat
from app.services.chat_store import get_chat as store_get_chat
from app.services.chat_store import list_chats as store_list_chats
from app.services.chat_store import update_chat as store_update_chat
from app.services.ollama import OllamaConnectionError, list_models, stream_chat

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str
    metrics: dict | None = None


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]


class StoredChatRequest(BaseModel):
    title: str | None = None
    model: str
    messages: list[ChatMessage] = []


@router.get("/models")
async def read_models() -> dict:
    try:
        models = await list_models()
    except OllamaConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    names = [model["name"] for model in models]
    completion_models = [
        model["name"]
        for model in models
        if "completion" in model.get("capabilities", []) or "thinking" in model.get("capabilities", [])
    ]
    preferred_models = ["qwen3:4b", "qwen3:14b", "qwen3:8b"]
    default_model = next(
        (model for model in preferred_models if model in names),
        completion_models[0] if completion_models else (names[0] if names else None),
    )
    return {"models": models, "default_model": default_model}


@router.get("/chats")
def read_chats() -> dict:
    return {"chats": store_list_chats()}


@router.get("/chats/{chat_id}")
def read_chat(chat_id: str) -> dict:
    chat = store_get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.post("/chats")
def create_stored_chat(request: StoredChatRequest) -> dict:
    messages = [message.dict(exclude_none=True) for message in request.messages]
    return store_create_chat(request.model, messages, request.title)


@router.put("/chats/{chat_id}")
def update_stored_chat(chat_id: str, request: StoredChatRequest) -> dict:
    messages = [message.dict(exclude_none=True) for message in request.messages]
    chat = store_update_chat(chat_id, request.model, messages, request.title)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.delete("/chats/{chat_id}")
def delete_stored_chat(chat_id: str) -> dict:
    if not store_delete_chat(chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"deleted": True}


@router.post("/chat")
async def create_chat(request: ChatRequest) -> StreamingResponse:
    try:
        models = await list_models()
    except OllamaConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    model_names = {model["name"] for model in models}
    if request.model not in model_names:
        raise HTTPException(status_code=404, detail=f"Model not found: {request.model}")

    messages = [{"role": message.role, "content": message.content} for message in request.messages]

    async def event_stream():
        async for event in stream_chat(request.model, messages):
            yield f"{json.dumps(event)}\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
    )
