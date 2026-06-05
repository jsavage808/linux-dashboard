from __future__ import annotations

import asyncio
import json
import os
import pty
import select
import signal
import struct
import subprocess
import termios
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


def _set_pty_size(fd: int, rows: int, cols: int) -> None:
    packed_size = struct.pack("HHHH", rows, cols, 0, 0)
    termios.tcsetwinsize(fd, (rows, cols))
    # Keep an ioctl-compatible path nearby for older Python runtimes and PTY tooling.
    if hasattr(termios, "TIOCSWINSZ"):
        import fcntl

        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed_size)


def _read_pty(fd: int) -> str:
    ready, _, _ = select.select([fd], [], [], 0.1)
    if not ready:
        return ""
    output = os.read(fd, 4096)
    return output.decode(errors="replace")


@router.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket) -> None:
    # SECURITY WARNING: this endpoint provides an interactive shell. Do not expose
    # it to the public internet without strong authentication, authorization, and
    # network controls.
    await websocket.accept()

    if hasattr(os, "geteuid") and os.geteuid() == 0:
        await websocket.send_text(
            "Refusing to start terminal because the backend process is running as root.\r\n"
        )
        await websocket.close(code=1011)
        return

    shell = "/bin/bash" if Path("/bin/bash").exists() else "/bin/sh"
    master_fd, slave_fd = pty.openpty()
    process = subprocess.Popen(
        [shell],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        start_new_session=True,
        env={
            **os.environ,
            "TERM": "xterm-256color",
            "SHELL": shell,
            "HOME": os.environ.get("HOME", "/home/appuser"),
        },
        close_fds=True,
    )
    os.close(slave_fd)

    async def stream_output() -> None:
        while process.poll() is None:
            output = await asyncio.to_thread(_read_pty, master_fd)
            if output:
                await websocket.send_text(output)

    async def stream_input() -> None:
        while process.poll() is None:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                os.write(master_fd, message.encode())
                continue

            if payload.get("type") == "resize":
                rows = max(1, int(payload.get("rows", 24)))
                cols = max(1, int(payload.get("cols", 80)))
                _set_pty_size(master_fd, rows, cols)
            elif payload.get("type") == "input":
                os.write(master_fd, payload.get("data", "").encode())

    output_task = asyncio.create_task(stream_output())
    input_task = asyncio.create_task(stream_input())

    try:
        done, pending = await asyncio.wait(
            {output_task, input_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in done:
            task.result()
        for task in pending:
            task.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        output_task.cancel()
        input_task.cancel()
        if process.poll() is None:
            process.send_signal(signal.SIGHUP)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
        os.close(master_fd)
