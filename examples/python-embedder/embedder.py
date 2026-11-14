"""Minimal Blast embedder: Python 3.10+ standard library only.

Spawns `blast serve`, speaks embedder protocol v1 over NDJSON stdio
(docs/embedding.md), opens every extension dir given on the command line,
draws the engine's root search views as text and maps terminal keys to
`root.input`/`session.input`:

    python3 -I embedder.py [-serve ../../packages/serve/src/main.ts] <extensionDir>...
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading

DEFAULT_SERVE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "packages", "serve", "src", "main.ts"
)
VIEWS = {"platform": "Linux"}
ARROWS = {65: "up", 66: "down", 67: "right", 68: "left"}

OUT: list[str] = []


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
    """Map a chunk of terminal bytes into semantic inputs.

    `search` is a one-element list holding the search text (the view owns the
    authoritative value and echoes it asynchronously). Arrow escape sequences
    usually arrive in one chunk; anything else after ESC is `back`.
    """
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
        self.seq, self.root, self.session = 0, "", ""
        self.protocol, self.version, self.catalog, self.closed = 0, "", {}, False
        self.ready = threading.Condition()
        threading.Thread(target=self._read, daemon=True).start()
        self._send({"type": "hello", "protocol": 1, "capabilities": ["clipboard.copy"], "views": VIEWS})
        with self.ready:
            if not self.ready.wait_for(lambda: self.protocol or self.closed, 30):
                raise RuntimeError("server did not answer the hello")

    def _send(self, message: dict) -> None:
        self.child.stdin.write(json.dumps(message) + "\n")
        self.child.stdin.flush()

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

    def _read(self) -> None:
        """The reader thread: dispatch every server line; EOF marks closed."""
        for line in self.child.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                continue  # malformed lines recover at the next newline
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
                if event in ("root.view", "session.view"):
                    draw(message.get("view") or {})
                elif event == "root.launched":
                    self.session = message.get("session", "")
                elif event == "session.exited":
                    self.session = ""
                self.events.append(message)
            elif kind == "capability.request":
                say(f'capability.request {message.get("name")} {json.dumps(message.get("params"))}')
                self._send({"type": "capability.result", "id": message["id"], "ok": True, "value": None})
            elif kind == "error":
                say(f'error {(message.get("error") or {}).get("code")}: {(message.get("error") or {}).get("message")}')
            with self.ready:
                self.ready.notify_all()
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
