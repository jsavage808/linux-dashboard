from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _chat_dir() -> Path:
    path = Path(os.getenv("CHAT_DATA_DIR", "data/chats"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chat_path(chat_id: str) -> Path:
    parsed_id = str(uuid.UUID(chat_id))
    return _chat_dir() / f"{parsed_id}.json"


def _title_from_messages(messages: list[dict[str, str]]) -> str:
    first_user = next((message.get("content", "") for message in messages if message.get("role") == "user"), "")
    title = " ".join(first_user.strip().split())
    if not title:
        return "New Chat"
    return title[:40]


def _read_chat_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_chat_file(path: Path, chat: dict[str, Any]) -> None:
    temp_path = path.with_suffix(".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(chat, handle, indent=2)
        handle.write("\n")
    temp_path.replace(path)


def list_chats() -> list[dict[str, Any]]:
    chats = []
    for path in _chat_dir().glob("*.json"):
        try:
            chat = _read_chat_file(path)
        except (OSError, json.JSONDecodeError):
            continue
        chats.append(
            {
                "id": chat.get("id"),
                "title": chat.get("title", "New Chat"),
                "model": chat.get("model", ""),
                "created_at": chat.get("created_at"),
                "updated_at": chat.get("updated_at"),
                "message_count": len(chat.get("messages", [])),
            }
        )

    return sorted(chats, key=lambda chat: chat.get("updated_at") or "", reverse=True)


def get_chat(chat_id: str) -> dict[str, Any] | None:
    try:
        path = _chat_path(chat_id)
    except ValueError:
        return None
    if not path.exists():
        return None
    return _read_chat_file(path)


def create_chat(model: str, messages: list[dict[str, str]], title: str | None = None) -> dict[str, Any]:
    chat_id = str(uuid.uuid4())
    timestamp = _now()
    chat = {
        "id": chat_id,
        "title": (title or "").strip()[:40] or _title_from_messages(messages),
        "model": model,
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": messages,
    }
    _write_chat_file(_chat_path(chat_id), chat)
    return chat


def update_chat(chat_id: str, model: str, messages: list[dict[str, str]], title: str | None = None) -> dict[str, Any] | None:
    existing = get_chat(chat_id)
    if existing is None:
        return None

    resolved_title = (title or existing.get("title") or "").strip()
    if not resolved_title or resolved_title == "New Chat":
        resolved_title = _title_from_messages(messages)

    chat = {
        "id": existing["id"],
        "title": resolved_title[:40],
        "model": model,
        "created_at": existing["created_at"],
        "updated_at": _now(),
        "messages": messages,
    }
    _write_chat_file(_chat_path(chat_id), chat)
    return chat


def delete_chat(chat_id: str) -> bool:
    try:
        path = _chat_path(chat_id)
    except ValueError:
        return False
    if not path.exists():
        return False
    path.unlink()
    return True
