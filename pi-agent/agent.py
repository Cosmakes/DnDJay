#!/usr/bin/env python3
"""
DnDJay Pi display agent (reference implementation of the §6 protocol).

A small WebSocket server that drives a fullscreen mpv instance over its JSON IPC
socket. Battlemaps live in the Obsidian vault; the plugin pushes them here. Assets
are identified by a content hash so an asset is never re-uploaded once cached.

Run mpv first (or via the bundled systemd unit), then this agent:

    mpv --idle=yes --force-window=yes --fullscreen --keep-open=yes \
        --image-display-duration=inf --vo=gpu --gpu-context=drm \
        --input-ipc-server=/tmp/mpv-dndjay.sock

    python3 agent.py --host 0.0.0.0 --port 8765 \
        --cache-dir ~/.cache/dndjay --mpv-ipc /tmp/mpv-dndjay.sock

Dependencies:  pip install websockets
"""

import argparse
import asyncio
import json
import math
import os
import socket

import websockets

BLACK_PNG_NAME = "black.png"


class MpvIpc:
    """Minimal mpv JSON-IPC client over its unix socket."""

    def __init__(self, sock_path: str):
        self.sock_path = sock_path

    def _send(self, payload: dict) -> None:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.connect(self.sock_path)
                s.sendall((json.dumps(payload) + "\n").encode("utf-8"))
        except OSError as e:
            print(f"[mpv] ipc error: {e}")

    def command(self, *args) -> None:
        self._send({"command": list(args)})

    def set_property(self, name: str, value) -> None:
        self._send({"command": ["set_property", name, value]})

    def loadfile(self, path: str) -> None:
        self.command("loadfile", path, "replace")


class Display:
    """Tracks current asset + framing and applies it to mpv (§6 conversions)."""

    def __init__(self, mpv: MpvIpc, cache_dir: str):
        self.mpv = mpv
        self.cache_dir = cache_dir
        self.current = None  # asset id, or None
        self.scale = 1.0
        self.x = 0.0
        self.y = 0.0
        self.rotate = 0

    def cached_ids(self):
        ids = []
        for name in os.listdir(self.cache_dir):
            if name != BLACK_PNG_NAME:
                ids.append(name)
        return ids

    def asset_path(self, asset_id: str) -> str:
        return os.path.join(self.cache_dir, asset_id)

    def have(self, asset_id: str) -> bool:
        return os.path.exists(self.asset_path(asset_id))

    def show(self, asset_id: str) -> None:
        self.mpv.loadfile(self.asset_path(asset_id))
        self.current = asset_id

    def blank(self) -> None:
        self.mpv.loadfile(os.path.join(self.cache_dir, BLACK_PNG_NAME))
        self.current = None

    def reset(self) -> None:
        self.transform(scale=1.0, x=0.0, y=0.0, rotate=0)

    def transform(self, scale=None, x=None, y=None, rotate=None) -> None:
        # Absolute set; omitted fields unchanged. Clamp per §6 value semantics.
        if scale is not None:
            self.scale = max(0.1, min(5.0, float(scale)))
            # mpv video-zoom is logarithmic: zoom = log2(scale).
            self.mpv.set_property("video-zoom", math.log2(self.scale))
        if x is not None:
            self.x = max(-1.0, min(1.0, float(x)))
            self.mpv.set_property("video-pan-x", self.x)
        if y is not None:
            self.y = max(-1.0, min(1.0, float(y)))
            self.mpv.set_property("video-pan-y", self.y)
        if rotate is not None:
            self.rotate = int(rotate) % 360
            self.mpv.set_property("video-rotate", self.rotate)

    def state_msg(self) -> dict:
        return {
            "type": "state",
            "current": self.current,
            "scale": self.scale,
            "x": self.x,
            "y": self.y,
            "rotate": self.rotate,
        }


async def handler(ws, display: Display):
    # On connect, advertise the cache and the current state.
    await ws.send(json.dumps({"type": "cached", "ids": display.cached_ids()}))
    await ws.send(json.dumps(display.state_msg()))

    pending_upload = None  # set when an `upload` header arrives; next binary = bytes

    async for message in ws:
        # Binary frame: the bytes of the asset named by the previous `upload`.
        if isinstance(message, (bytes, bytearray)):
            if pending_upload is None:
                continue
            with open(display.asset_path(pending_upload["id"]), "wb") as f:
                f.write(message)
            await ws.send(json.dumps({"type": "ack", "cmd": "upload", "ok": True}))
            pending_upload = None
            continue

        try:
            msg = json.loads(message)
        except json.JSONDecodeError:
            continue
        cmd = msg.get("cmd")

        if cmd == "have":
            await ws.send(json.dumps({"type": "ack", "cmd": "have",
                                      "ok": display.have(msg.get("id", ""))}))
        elif cmd == "upload":
            if "dataB64" in msg:  # base64 fallback
                import base64
                with open(display.asset_path(msg["id"]), "wb") as f:
                    f.write(base64.b64decode(msg["dataB64"]))
                await ws.send(json.dumps({"type": "ack", "cmd": "upload", "ok": True}))
            else:
                pending_upload = {"id": msg["id"]}  # bytes arrive in the next frame
        elif cmd == "show":
            display.show(msg.get("id", ""))
            await ws.send(json.dumps(display.state_msg()))
        elif cmd == "transform":
            display.transform(msg.get("scale"), msg.get("x"),
                              msg.get("y"), msg.get("rotate"))
            await ws.send(json.dumps(display.state_msg()))
        elif cmd == "reset":
            display.reset()
            await ws.send(json.dumps(display.state_msg()))
        elif cmd == "blank":
            display.blank()
            await ws.send(json.dumps(display.state_msg()))
        elif cmd == "ping":
            await ws.send(json.dumps({"type": "pong"}))
        else:
            await ws.send(json.dumps({"type": "error", "message": f"unknown cmd {cmd}"}))


def ensure_black_png(cache_dir: str) -> None:
    """Write a 1x1 black PNG used for the `blank` command, if missing."""
    path = os.path.join(cache_dir, BLACK_PNG_NAME)
    if os.path.exists(path):
        return
    # Smallest valid 1x1 black PNG.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d4944415478da63606060f80f000104010080bbd15b0000000049454e44ae426082"
    )
    with open(path, "wb") as f:
        f.write(png)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--cache-dir", default=os.path.expanduser("~/.cache/dndjay"))
    ap.add_argument("--mpv-ipc", default="/tmp/mpv-dndjay.sock")
    args = ap.parse_args()

    os.makedirs(args.cache_dir, exist_ok=True)
    ensure_black_png(args.cache_dir)

    display = Display(MpvIpc(args.mpv_ipc), args.cache_dir)
    print(f"[dndjay] listening on ws://{args.host}:{args.port}  cache={args.cache_dir}")
    async with websockets.serve(lambda ws: handler(ws, display),
                                args.host, args.port, max_size=None):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
