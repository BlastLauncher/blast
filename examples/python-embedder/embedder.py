"""Minimal Blast embedder: Python 3.10+ standard library only.

Spawns `blast serve`, speaks embedder protocol v2 over NDJSON stdio
(docs/embedding.md), opens every extension dir given on the command line,
draws the engine's root search views as text (applying `*.view.patch` updates
and resyncing on any revision gap) and maps terminal keys to
`root.input`/`session.input`:

    python3 -I embedder.py [-serve ../../packages/serve/src/main.ts] <extensionDir>...
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import sys
import threading
from typing import Any

PROTOCOL_VERSION = 2
DEFAULT_SERVE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "packages", "serve", "src", "main.ts"
)
VIEWS = {"platform": "Linux"}
ARROWS = {65: "up", 66: "down", 67: "right", 68: "left"}

OUT: list[str] = []


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _format_path(path: list[str]) -> str:
    return "<root>" if not path else ".".join(path)


def _apply_at(node: Any, path: list[str], depth: int, leaf) -> Any:
    if depth == len(path):
        return leaf(node)
    if not isinstance(node, dict):
        raise ValueError(f"Path does not exist: {_format_path(path)}")
    key = path[depth]
    is_final = depth == len(path) - 1
    if not is_final and key not in node:
        raise ValueError(f"Path does not exist: {_format_path(path)}")
    updated = _apply_at(node.get(key), path, depth + 1, leaf)
    copy_obj = dict(node)
    copy_obj[key] = updated
    return copy_obj


def _apply_op(root: Any, op: Any) -> Any:
    if not isinstance(op, dict):
        raise ValueError("View patch op must be an object")
    kind = op.get("op")
    path = op.get("path")
    if not isinstance(path, list) or not all(isinstance(segment, str) for segment in path):
        raise ValueError("View patch op path must be a list of strings")

    if kind == "set":
        if "value" not in op:
            raise ValueError(f"Set op missing value: {_format_path(path)}")
        value = copy.deepcopy(op["value"])
        if not path:
            return value
        return _apply_at(root, path, 0, lambda _: value)

    if kind == "delete":
        if not path:
            raise ValueError("Cannot delete view root")
        parent_path, key = path[:-1], path[-1]

        def apply_delete(target: Any) -> Any:
            if not isinstance(target, dict) or key not in target:
                raise ValueError(f"Path does not exist: {_format_path(path)}")
            copy_obj = dict(target)
            del copy_obj[key]
            return copy_obj

        return apply_delete(root) if not parent_path else _apply_at(root, parent_path, 0, apply_delete)

    if kind == "splice":
        at = op.get("at")
        remove = op.get("remove")
        insert = op.get("insert")
        if not _is_int(at) or not _is_int(remove) or not isinstance(insert, list):
            raise ValueError(f"Invalid splice op at {_format_path(path)}")

        def apply_splice(target: Any) -> Any:
            if not isinstance(target, list):
                raise ValueError(f"Splice target is not an array: {_format_path(path)}")
            if at < 0 or at > len(target):
                raise ValueError(f"Splice index out of bounds: {at} (length {len(target)})")
            if remove < 0 or at + remove > len(target):
                raise ValueError(f"Splice remove count out of bounds: {remove} at {at} (length {len(target)})")
            return target[:at] + [copy.deepcopy(item) for item in insert] + target[at + remove :]

        if not path:
            return apply_splice(root)
        parent_path, key = path[:-1], path[-1]

        def splice_in_parent(parent: Any) -> Any:
            if not isinstance(parent, dict) or key not in parent:
                raise ValueError(f"Path does not exist: {_format_path(path)}")
            copy_obj = dict(parent)
            copy_obj[key] = apply_splice(parent[key])
            return copy_obj

        return splice_in_parent(root) if not parent_path else _apply_at(root, parent_path, 0, splice_in_parent)

    raise ValueError(f"Unknown view patch op: {kind!r}")


def apply_view_patch(view: Any, patch: dict[str, Any], current_revision: int | None = None) -> Any:
    """Purely apply a protocol-2 view patch without mutating `view` (decision 0020)."""
    base_revision = patch.get("baseRevision")
    revision = patch.get("revision")
    if current_revision is not None:
        if not _is_int(current_revision) or current_revision < 1:
            raise ValueError(f"Invalid currentRevision: {current_revision!r}")
        if base_revision is None:
            raise ValueError(f"View patch missing baseRevision (expected {current_revision})")
        if not _is_int(base_revision) or base_revision != current_revision:
            raise ValueError(f"View patch baseRevision mismatch: expected {current_revision}, got {base_revision!r}")
    if base_revision is not None and revision is not None:
        if not _is_int(base_revision) or not _is_int(revision) or revision != base_revision + 1:
            raise ValueError(f"View patch revision mismatch: expected {base_revision + 1 if _is_int(base_revision) else '?'}, got {revision!r}")
    ops = patch.get("ops")
    if not isinstance(ops, list):
        raise ValueError("View patch missing ops")
    current = view
    for op in ops:
        current = _apply_op(current, op)
    return current


def say(line: str) -> None:
    """Print one line of embedder output (also kept in OUT for the tests)."""
    OUT.append(line)
    print(line, flush=True)


def draw(view: dict) -> None:
    """Print a controller view (docs/embedding.md) as plain text."""
    if view.get("title"):
        say(f'view "{view["title"]}"')
    search = view.get("search") or {}
    if search.get("text") or search.get("placeholder"):
        say(f'search "{search.get("text", "")}"')
    for field in (view.get("form") or {}).get("fields") or []:
        say(f'  field "{field["id"]}"' + (f' error "{field["error"]}"' if field.get("error") else ""))
    for row in view.get("rows") or []:
        say(("> " if row.get("selected") else "  ") + str(row.get("title", "")))
    actions = view.get("actions") or {}
    if actions.get("open"):
        say(f'actions "{actions.get("query", "")}"')
        for row in actions.get("rows") or []:
            say(("> " if row.get("selected") else "  ") + str(row.get("title", "")))
    toast = (view.get("feedback") or {}).get("toast")
    if toast:
        say(f'toast "{toast.get("message") or toast.get("title", "")}"')


def key_inputs(data: bytes, search: list[str]) -> list[dict]:
    """Map a chunk of terminal bytes into semantic inputs. `search` is a one-element
    list holding the search text (the view echoes the authoritative value). Arrow
    escape sequences usually arrive in one chunk; anything else after ESC is `back`."""
    inputs: list[dict] = []
    index = 0
    while index < len(data):
        byte, index = data[index], index + 1
        if byte in (10, 13):
            inputs.append({"type": "primary"})
        elif byte == 63:  # ?
            inputs.append({"type": "openActions"})
        elif byte == 106:  # j
            inputs.append({"type": "move", "direction": "down"})
        elif byte == 107:  # k
            inputs.append({"type": "move", "direction": "up"})
        elif byte == 27 and data[index : index + 1] == b"[" and data[index + 1 : index + 2] in (b"A", b"B", b"C", b"D"):
            inputs.append({"type": "move", "direction": ARROWS[data[index + 1]]})
            index += 2
        elif byte == 27:
            inputs.append({"type": "back"})
        elif byte in (8, 127) and search[0]:
            search[0] = search[0][:-1]
            inputs.append({"type": "search", "text": search[0]})
        elif 32 <= byte <= 126:
            search[0] += chr(byte)
            inputs.append({"type": "search", "text": search[0]})
    return inputs


class Client:
    """NDJSON stdio client for `blast serve`; a reader thread dispatches."""

    def __init__(self, serve_path: str = DEFAULT_SERVE, args: list[str] | None = None, env: dict | None = None):
        self.child = subprocess.Popen(["node", serve_path, *(args or [])], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, text=True, env={**os.environ, **(env or {})})
        self.pending: dict[str, dict | None] = {}
        self.events: list[dict] = []
        self._root_views: dict[str, dict[str, Any]] = {}
        self._session_views: dict[str, dict[str, Any]] = {}
        self._write_lock = threading.Lock()
        self.seq, self.root, self.session, self._session_root = 0, "", "", ""
        self.protocol, self.version, self.catalog, self.closed = 0, "", {}, False
        self.ready = threading.Condition()
        threading.Thread(target=self._read, daemon=True).start()
        self._send({"type": "hello", "protocol": PROTOCOL_VERSION, "capabilities": ["clipboard.copy"], "views": VIEWS})
        with self.ready:
            if not self.ready.wait_for(lambda: self.protocol or self.closed, 30):
                raise RuntimeError("server did not answer the hello")
        if self.protocol != PROTOCOL_VERSION:
            raise RuntimeError(f"unsupported protocol version {self.protocol}, expected {PROTOCOL_VERSION}")

    def _send(self, message: dict) -> None:
        with self._write_lock:
            self.child.stdin.write(json.dumps(message) + "\n")
            self.child.stdin.flush()

    def _send_resync(self, kind: str, handle: str) -> None:
        with self.ready:
            self.seq += 1
            req_id = str(self.seq)
        try:
            self._send({"type": "request", "id": req_id, "method": f"{kind}.resync", "params": {kind: handle}})
        except (OSError, ValueError):
            pass  # stdin may already be closed during shutdown

    def request(self, method: str, params: dict | None = None) -> dict:
        """Send a request and wait for its response; raises when not ok."""
        with self.ready:
            self.seq += 1
            id, self.pending[id] = str(self.seq), None
        self._send({"type": "request", "id": id, "method": method, "params": params or {}})
        with self.ready:
            self.ready.wait_for(lambda: self.pending.get(id) is not None or self.closed, 60)
            response = self.pending.pop(id)
        if response is None:
            raise RuntimeError(f"server closed while {method} was outstanding")
        if not response.get("ok"):
            error = response.get("error") or {}
            raise RuntimeError(f'{method} failed: {error.get("code")}: {error.get("message")}')
        return response.get("result") or {}

    def input(self, inp: dict) -> None:
        """Send one semantic input to the active session, else to the root."""
        if self.session:
            self.request("session.input", {"session": self.session, "input": inp})
        else:
            self.request("root.input", {"root": self.root, "input": inp})

    def shutdown(self) -> int:
        """`engine.shutdown`; the server finishes pending work and exits."""
        try:
            self.request("engine.shutdown")
        except RuntimeError:
            pass  # the server may exit before the response arrives
        self.child.stdin.close()
        return self.child.wait()

    def _handle_view_event(self, message: dict) -> bool:
        event = message.get("event")
        if event in ("root.view", "session.view"):
            kind = "root" if event == "root.view" else "session"
            store = self._root_views if kind == "root" else self._session_views
            handle = message.get(kind)
            revision = message.get("revision")
            if not isinstance(handle, str) or not handle or "view" not in message or not _is_int(revision) or revision < 1:
                return False
            view = copy.deepcopy(message["view"])
            store[handle] = {"view": view, "revision": revision, "resyncing": False}
            if isinstance(view, dict) and (kind != "root" or not self.session):
                draw(view)
            return True

        if event in ("root.view.patch", "session.view.patch"):
            kind = "root" if event == "root.view.patch" else "session"
            store = self._root_views if kind == "root" else self._session_views
            handle = message.get(kind)
            if not isinstance(handle, str) or not handle:
                return False
            state = store.get(handle)
            if state is not None and state["resyncing"]:
                return False
            revision = message.get("revision")
            base_revision = message.get("baseRevision")
            ops = message.get("ops")
            if (
                state is None
                or not _is_int(revision)
                or not _is_int(base_revision)
                or not isinstance(ops, list)
                or base_revision != state["revision"]
                or revision != base_revision + 1
            ):
                store[handle] = {"view": None, "revision": 0, "resyncing": True}
                self._send_resync(kind, handle)
                return False
            try:
                next_view = apply_view_patch(
                    state["view"],
                    {"revision": revision, "baseRevision": base_revision, "ops": ops},
                    state["revision"],
                )
            except ValueError:
                store[handle] = {"view": None, "revision": 0, "resyncing": True}
                self._send_resync(kind, handle)
                return False
            store[handle] = {"view": next_view, "revision": revision, "resyncing": False}
            message["view"] = next_view
            if isinstance(next_view, dict) and (kind != "root" or not self.session):
                draw(next_view)
            return True

        return True

    def _handle_message(self, message: dict) -> None:
        kind = message.get("type")
        if kind == "welcome":
            self.protocol = message.get("protocol", 0)
            self.version = (message.get("engine") or {}).get("version", "")
            self.catalog = message.get("catalog") or {}
        elif kind == "response":
            if message.get("id") in self.pending:
                self.pending[message["id"]] = message
        elif kind == "event":
            event = message.get("event")
            if event in ("root.view", "session.view", "root.view.patch", "session.view.patch"):
                if self._handle_view_event(message):
                    self.events.append(message)
            else:
                if event == "root.launched":
                    self.session = message.get("session", "")
                    self._session_root = message.get("root", "")
                elif event == "session.exited":
                    exited = message.get("session", "")
                    self._session_views.pop(exited, None)
                    if exited and self.session == exited:
                        root = getattr(self, "_session_root", "") or self.root
                        self.session = ""
                        self._session_root = ""
                        state = self._root_views.get(root)
                        if state and not state["resyncing"] and isinstance(state["view"], dict):
                            draw(state["view"])
                self.events.append(message)
        elif kind == "capability.request":
            say(f'capability.request {message.get("name")} {json.dumps(message.get("params"))}')
            self._send({"type": "capability.result", "id": message["id"], "ok": True, "value": None})
        elif kind == "error":
            say(f'error {(message.get("error") or {}).get("code")}: {(message.get("error") or {}).get("message")}')
        with self.ready:
            if kind == "error":  # the rejected line's request never gets a response: fail them all
                failed = {"ok": False, "error": message.get("error") or {}}
                self.pending.update({id: failed for id, got in self.pending.items() if got is None})
            self.ready.notify_all()

    def _read(self) -> None:
        """The reader thread: dispatch every server line; EOF marks closed."""
        try:
            for line in self.child.stdout:
                try:
                    message = json.loads(line)
                except ValueError:
                    continue  # malformed lines recover at the next newline
                self._handle_message(message)
        finally:
            with self.ready:
                self.closed = True
                self.ready.notify_all()


def main() -> None:
    """Spawn the server, open every extension dir, then drive the root view."""
    parser = argparse.ArgumentParser(description="Minimal Blast embedder: Python stdlib only.")
    parser.add_argument("-serve", default=DEFAULT_SERVE, help="serve entry to spawn with node")
    parser.add_argument("dirs", nargs="+", help="extension directories to open")
    args = parser.parse_args()
    client = Client(args.serve)
    say(f"connected: engine {client.version}, protocol v{client.protocol}, {len(client.catalog)} capabilities")
    for directory in args.dirs:
        client.request("extension.open", {"dir": directory})
    client.root = client.request("root.open", {})["root"]
    search = [""]
    try:
        while data := os.read(0, 64):
            for inp in key_inputs(data, search):
                client.input(inp)
    finally:
        sys.exit(client.shutdown() or None)


if __name__ == "__main__":
    main()
