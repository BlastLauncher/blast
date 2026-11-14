#!/usr/bin/env python3
"""Flow tests for embedder.py against the real server (`bun run example:python`).

Covers handshake, root search, launch, the 0157 prompt-form fixture, primary
action, the clipboard round trip, protocol errors and shutdown.
"""

from __future__ import annotations

import glob
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python3 -I keeps the script dir off sys.path
from embedder import OUT, DEFAULT_SERVE, Client, key_inputs  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HELLO = os.path.join(REPO, "fixtures", "extensions", "hello-list")
ENGINE_HANDLE = os.path.join(REPO, "fixtures", "extensions", "engine-handle")


def wait(client: Client, match, timeout: float = 30.0) -> dict:
    """Poll the client's event log for the first message matching `match`."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for message in list(client.events):
            if match(message):
                client.events.remove(message)
                return message
        time.sleep(0.02)
    raise TimeoutError("no matching event")


def stop(client: Client) -> None:
    """Kill the server and close the pipes so no ResourceWarning is left."""
    for stream in (client.child.stdin, client.child.stdout):
        if not stream.closed:
            stream.close()
    client.child.kill()
    client.child.wait()


class EmbedderFlow(unittest.TestCase):
    def setUp(self) -> None:
        self.data = tempfile.TemporaryDirectory(prefix="blast-python-")
        self.client = Client(
            DEFAULT_SERVE, args=["--dependencies", "manual"], env={"XDG_DATA_HOME": self.data.name}
        )

    def tearDown(self) -> None:
        stop(self.client)
        self.data.cleanup()

    def shutdown(self) -> None:
        self.assertEqual(self.client.shutdown(), 0)

    def test_handshake(self) -> None:
        self.assertEqual(self.client.protocol, 1)
        self.assertEqual(self.client.version, "0.0.0-dev")
        self.assertIn("clipboard.copy", self.client.catalog)
        self.shutdown()

    def test_eof_shuts_down_cleanly(self) -> None:
        client = Client(
            DEFAULT_SERVE, args=["--dependencies", "manual"], env={"XDG_DATA_HOME": self.data.name}
        )
        client.child.stdin.close()
        try:
            self.assertEqual(client.child.wait(timeout=30), 0)
        finally:
            stop(client)

    def test_key_inputs(self) -> None:
        search = [""]
        self.assertEqual(key_inputs(b"\x1b[B", search), [{"type": "move", "direction": "down"}])
        self.assertEqual(key_inputs(b"k", search), [{"type": "move", "direction": "up"}])
        self.assertEqual(key_inputs(b"\r", search), [{"type": "primary"}])
        self.assertEqual(key_inputs(b"?", search), [{"type": "openActions"}])
        self.assertEqual(key_inputs(b"a", search), [{"type": "search", "text": "a"}])
        self.assertEqual(key_inputs(b"p", search), [{"type": "search", "text": "ap"}])
        self.assertEqual(key_inputs(b"\x7f", search), [{"type": "search", "text": "a"}])
        self.assertEqual(key_inputs(b"\x1b", search), [{"type": "back"}])
        self.assertEqual(key_inputs(b"\x1b[D", search), [{"type": "move", "direction": "left"}])

    def test_root_search_launch_primary_action_and_clipboard(self) -> None:
        self.client.request("extension.open", {"dir": HELLO})
        root = self.client.request("root.open", {})["root"]
        self.client.root = root
        listed = wait(self.client, lambda m: m.get("event") == "root.view" and m["view"].get("rows"))
        items = [row["id"] for row in listed["view"]["rows"] if row.get("kind") == "item"]
        self.assertEqual(items, ["hello-list:index"])
        self.client.events.clear()
        self.client.request("root.input", {"root": root, "input": {"type": "search", "text": "zzz"}})
        empty = wait(self.client, lambda m: m.get("event") == "root.view" and not m["view"].get("rows"))
        self.assertEqual(empty["view"]["search"]["text"], "zzz")
        self.client.events.clear()
        self.client.request("root.input", {"root": root, "input": {"type": "search", "text": ""}})
        wait(self.client, lambda m: m.get("event") == "root.view" and m["view"].get("rows"))
        self.client.events.clear()
        self.client.input({"type": "primary"})
        launched = wait(self.client, lambda m: m.get("event") == "root.launched")
        self.assertEqual(launched["root"], root)
        session = launched["session"]
        view = wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and m["view"].get("rows"),
        )
        self.assertTrue(any(row["title"] == "apple" for row in view["view"]["rows"]))
        # Primary runs the selected row's CopyToClipboard; the embedder answers it.
        self.client.events.clear()
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        copied = wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and "copied apple" in m["view"].get("title", ""),
        )
        self.assertIn("copied apple", copied["view"]["title"])
        self.assertTrue(
            any(line.startswith("capability.request clipboard.copy") for line in OUT), list(OUT)
        )
        # Back closes the command; the root resumes with its search cleared.
        self.client.events.clear()
        self.client.request("session.input", {"session": session, "input": {"type": "back"}})
        exited = wait(
            self.client, lambda m: m.get("event") == "session.exited" and m.get("session") == session
        )
        self.assertEqual(exited.get("code"), 0)
        resumed = wait(
            self.client,
            lambda m: m.get("event") == "root.view"
            and m["view"].get("rows")
            and m["view"].get("search", {}).get("text", "") == "",
        )
        self.assertEqual(
            [row["id"] for row in resumed["view"]["rows"] if row.get("kind") == "item"],
            ["hello-list:index"],
        )
        self.shutdown()

    def test_protocol_error_fails_outstanding_requests(self) -> None:
        extension = self.client.request("extension.open", {"dir": HELLO})["extension"]
        session = self.client.request("extension.launch", {"extension": extension, "command": "index"})["session"]
        # A search without `text` is rejected as a line: no response, only a protocol error.
        started = time.monotonic()
        with self.assertRaises(RuntimeError) as raised:
            self.client.request("session.input", {"session": session, "input": {"type": "search"}})
        self.assertLess(time.monotonic() - started, 30)
        self.assertIn("session.input failed", str(raised.exception))
        self.assertTrue(any(line.startswith("error ") for line in OUT), list(OUT))
        # The client keeps working after the error.
        self.client.request("session.input", {"session": session, "input": {"type": "back"}})
        wait(self.client, lambda m: m.get("event") == "session.exited" and m.get("session") == session)
        self.shutdown()

    def test_launch_prompts_a_form_for_missing_values(self) -> None:
        # The 0157 prompt fixture: engine-handle plus a required password
        # preference and a required argument.
        directory = os.path.join(self.data.name, "prompt-extension")
        shutil.copytree(ENGINE_HANDLE, directory)
        manifest_path = os.path.join(directory, "package.json")
        with open(manifest_path) as handle:
            manifest = json.load(handle)
        manifest["preferences"] = [
            {"name": "token", "type": "password", "title": "Token", "required": True}
        ]
        manifest["commands"][0]["arguments"] = [{"name": "query", "type": "text", "required": True}]
        with open(manifest_path, "w") as handle:
            json.dump(manifest, handle)
        extension = self.client.request("extension.open", {"dir": directory})["extension"]
        launched = self.client.request(
            "extension.launch", {"extension": extension, "command": "index", "prompts": True}
        )
        session = launched["session"]
        form = wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and m["view"].get("kind") == "form",
        )["view"]
        self.assertEqual([field["id"] for field in form["form"]["fields"]], ["token", "argument:query"])
        # Submitting empty marks both required fields; nothing echoes the password.
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        invalid = wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and m["view"].get("form", {}).get("fields", [{}])[0].get("error"),
        )["view"]
        self.assertEqual([field.get("error") for field in invalid["form"]["fields"]], ["Required", "Required"])
        self.client.request(
            "session.input", {"session": session, "input": {"type": "setValue", "id": "token", "value": "hunter2"}}
        )
        self.client.request(
            "session.input",
            {"session": session, "input": {"type": "setValue", "id": "argument:query", "value": "hello"}},
        )
        wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and m["view"].get("form", {}).get("fields", [{}])[0].get("hasValue"),
        )
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        command = wait(
            self.client,
            lambda m: m.get("event") == "session.view"
            and m.get("session") == session
            and m["view"].get("rows"),
        )["view"]
        self.assertEqual(command.get("kind"), "list")
        self.assertEqual(command.get("title"), "Engine fixture")
        self.assertIn("hello", command["rows"][0]["title"])
        # The submitted preference was saved under the data dir.
        saved = glob.glob(os.path.join(self.data.name, "blast", "preferences", "*.json"))
        with open(saved[0]) as handle:
            preferences = json.load(handle)
        self.assertEqual(preferences["extension"]["token"], "hunter2")
        self.client.request("session.input", {"session": session, "input": {"type": "back"}})
        wait(self.client, lambda m: m.get("event") == "session.exited" and m.get("session") == session)
        self.shutdown()


if __name__ == "__main__":
    unittest.main()
