#!/usr/bin/env python3
"""Flow and protocol-2 view-patch tests for embedder.py (`bun run example:python`).

Covers handshake, root search, launch, the 0157 prompt-form fixture, primary
action, the clipboard round trip, shared view-patch fixtures, revision-gap
resync, protocol errors and shutdown.
"""

from __future__ import annotations

import copy
import glob
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python3 -I keeps the script dir off sys.path
from embedder import OUT, DEFAULT_SERVE, PROTOCOL_VERSION, Client, apply_view_patch, key_inputs  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HELLO = os.path.join(REPO, "fixtures", "extensions", "hello-list")
ENGINE_HANDLE = os.path.join(REPO, "fixtures", "extensions", "engine-handle")
PATCH_FIXTURES = os.path.join(REPO, "fixtures", "protocol", "view-patches.json")

ROOT_VIEW_EVENTS = ("root.view", "root.view.patch")
SESSION_VIEW_EVENTS = ("session.view", "session.view.patch")


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


class ViewPatchTests(unittest.TestCase):
    def test_shared_view_patch_fixtures(self) -> None:
        with open(PATCH_FIXTURES) as handle:
            data = json.load(handle)
        cases = data["cases"]
        self.assertGreater(len(cases), 0)
        for case in cases:
            with self.subTest(case=case["name"]):
                prev_snapshot = copy.deepcopy(case["prev"])
                patched = apply_view_patch(
                    case["prev"], case["patch"], case["patch"]["baseRevision"]
                )
                self.assertEqual(patched, case["next"])
                self.assertEqual(case["prev"], prev_snapshot)

    def test_apply_view_patch_errors(self) -> None:
        base = {
            "title": "a",
            "empty": None,
            "search": {"text": ""},
            "rows": [{"id": "1"}],
        }
        bad_patches = [
            ({"ops": [{"op": "set", "path": ["missing", "child"], "value": 1}]}, None),
            ({"ops": [{"op": "set", "path": ["empty", "title"], "value": "x"}]}, None),
            ({"ops": [{"op": "set", "path": ["rows", "0"], "value": "x"}]}, None),
            ({"ops": [{"op": "delete", "path": ["nonexistent"]}]}, None),
            ({"ops": [{"op": "delete", "path": []}]}, None),
            ({"ops": [{"op": "splice", "path": ["missing"], "at": 0, "remove": 0, "insert": []}]}, None),
            ({"ops": [{"op": "splice", "path": ["title"], "at": 0, "remove": 0, "insert": []}]}, None),
            ({"ops": [{"op": "splice", "path": ["rows"], "at": 2, "remove": 0, "insert": []}]}, None),
            ({"ops": [{"op": "splice", "path": ["rows"], "at": 0, "remove": 2, "insert": []}]}, None),
            ({"ops": [{"op": "splice", "path": ["rows"], "at": True, "remove": 0, "insert": []}]}, None),
            ({"baseRevision": 2, "revision": 3, "ops": []}, 1),
            ({"baseRevision": 1, "revision": 4, "ops": []}, 1),
            ({"ops": []}, 1),
        ]
        for patch, current in bad_patches:
            with self.assertRaises(ValueError):
                apply_view_patch(base, patch, current)

    def test_revision_gap_and_apply_error_trigger_resync(self) -> None:
        client = object.__new__(Client)
        stdin = io.StringIO()
        client.child = types.SimpleNamespace(stdin=stdin)
        client.pending = {}
        client.events = []
        client._root_views = {}
        client._session_views = {}
        client._write_lock = threading.Lock()
        client.seq, client.root, client.session, client._session_root = 0, "", "", ""
        client.protocol, client.version, client.catalog, client.closed = PROTOCOL_VERSION, "", {}, False
        client.ready = threading.Condition()

        # Root: full view rev 1, then gap patch (baseRevision 2 -> resync), then another dropped patch.
        client._handle_message(
            {"type": "event", "event": "root.view", "root": "r1", "revision": 1, "view": {"title": "Root", "rows": []}}
        )
        client._handle_message(
            {
                "type": "event",
                "event": "root.view.patch",
                "root": "r1",
                "baseRevision": 2,
                "revision": 3,
                "ops": [{"op": "set", "path": ["title"], "value": "Skipped"}],
            }
        )
        client._handle_message(
            {
                "type": "event",
                "event": "root.view.patch",
                "root": "r1",
                "baseRevision": 3,
                "revision": 4,
                "ops": [{"op": "set", "path": ["title"], "value": "AlsoSkipped"}],
            }
        )

        sent = [json.loads(line) for line in stdin.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["type"], "request")
        self.assertEqual(sent[0]["method"], "root.resync")
        self.assertEqual(sent[0]["params"], {"root": "r1"})
        self.assertEqual(len(client.events), 1)

        # Full view clears resync state; matching patch applies cleanly.
        client._handle_message(
            {"type": "event", "event": "root.view", "root": "r1", "revision": 5, "view": {"title": "Resynced", "rows": []}}
        )
        client._handle_message(
            {
                "type": "event",
                "event": "root.view.patch",
                "root": "r1",
                "baseRevision": 5,
                "revision": 6,
                "ops": [{"op": "set", "path": ["title"], "value": "Recovered"}],
            }
        )
        self.assertEqual(client.events[-1]["view"]["title"], "Recovered")

        # Session: apply error triggers session.resync and drops patches until full view.
        stdin.seek(0)
        stdin.truncate(0)
        client._handle_message(
            {"type": "event", "event": "session.view", "session": "s1", "revision": 1, "view": {"title": "Session"}}
        )
        client._handle_message(
            {
                "type": "event",
                "event": "session.view.patch",
                "session": "s1",
                "baseRevision": 1,
                "revision": 2,
                "ops": [{"op": "delete", "path": ["missing"]}],
            }
        )
        client._handle_message(
            {
                "type": "event",
                "event": "session.view.patch",
                "session": "s1",
                "baseRevision": 2,
                "revision": 3,
                "ops": [{"op": "set", "path": ["title"], "value": "Ignored"}],
            }
        )
        session_sent = [json.loads(line) for line in stdin.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(session_sent), 1)
        self.assertEqual(session_sent[0]["method"], "session.resync")
        self.assertEqual(session_sent[0]["params"], {"session": "s1"})

    def test_resync_after_stdin_closed_reaches_reader_shutdown(self) -> None:
        class BrokenPipeStream:
            def write(self, _text: str) -> int:
                raise BrokenPipeError("pipe closed")

            def flush(self) -> None:
                pass

        closed_stdin = io.StringIO()
        closed_stdin.close()

        for label, stdin_stream in (("closed", closed_stdin), ("broken_pipe", BrokenPipeStream())):
            with self.subTest(stdin=label):
                client = object.__new__(Client)
                lines = [
                    json.dumps(
                        {"type": "event", "event": "root.view", "root": "r1", "revision": 1, "view": {"title": "Root"}}
                    )
                    + "\n",
                    json.dumps(
                        {
                            "type": "event",
                            "event": "root.view.patch",
                            "root": "r1",
                            "baseRevision": 2,
                            "revision": 3,
                            "ops": [{"op": "set", "path": ["title"], "value": "Gap"}],
                        }
                    )
                    + "\n",
                ]
                client.child = types.SimpleNamespace(stdin=stdin_stream, stdout=io.StringIO("".join(lines)))
                client.pending = {}
                client.events = []
                client._root_views = {}
                client._session_views = {}
                client._write_lock = threading.Lock()
                client.seq, client.root, client.session, client._session_root = 0, "", "", ""
                client.protocol, client.version, client.catalog, client.closed = PROTOCOL_VERSION, "", {}, False
                client.ready = threading.Condition()

                reader = threading.Thread(target=client._read)
                reader.start()
                with client.ready:
                    reached_shutdown = client.ready.wait_for(lambda: client.closed, 5)
                reader.join(timeout=5)
                self.assertTrue(reached_shutdown)
                self.assertTrue(client.closed)
                self.assertEqual(len(client.events), 1)


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
        self.assertEqual(self.client.protocol, PROTOCOL_VERSION)
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
        listed = wait(self.client, lambda m: m.get("event") in ROOT_VIEW_EVENTS and m["view"].get("rows"))
        items = [row["id"] for row in listed["view"]["rows"] if row.get("kind") == "item"]
        self.assertEqual(items, ["hello-list:index"])
        self.client.events.clear()
        self.client.request("root.input", {"root": root, "input": {"type": "search", "text": "zzz"}})
        empty = wait(self.client, lambda m: m.get("event") in ROOT_VIEW_EVENTS and not m["view"].get("rows"))
        self.assertEqual(empty["event"], "root.view.patch")
        self.assertEqual(empty["view"]["search"]["text"], "zzz")
        self.client.events.clear()
        self.client.request("root.input", {"root": root, "input": {"type": "search", "text": ""}})
        cleared = wait(
            self.client,
            lambda m: m.get("event") in ROOT_VIEW_EVENTS
            and m["view"].get("rows")
            and m["view"].get("search", {}).get("text", "") == "",
        )
        root_title = cleared["view"].get("title", "")
        selected_root_row = next(row["title"] for row in cleared["view"]["rows"] if row.get("selected"))
        self.client.events.clear()
        self.client.input({"type": "primary"})
        launched = wait(self.client, lambda m: m.get("event") == "root.launched")
        self.assertEqual(launched["root"], root)
        session = launched["session"]
        view = wait(
            self.client,
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
            and m.get("session") == session
            and m["view"].get("rows"),
        )
        self.assertTrue(any(row["title"] == "apple" for row in view["view"]["rows"]))
        # Primary runs the selected row's CopyToClipboard; the embedder answers it.
        self.client.events.clear()
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        copied = wait(
            self.client,
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
            and m.get("session") == session
            and "copied apple" in m["view"].get("title", ""),
        )
        self.assertEqual(copied["event"], "session.view.patch")
        self.assertIn("copied apple", copied["view"]["title"])
        self.assertTrue(
            any(line.startswith("capability.request clipboard.copy") for line in OUT), list(OUT)
        )
        # Back closes the command; protocol 2 sends no root event when the root
        # search was already empty, so the client redraws its cached root view.
        self.client.events.clear()
        before_exit = len(OUT)
        self.client.request("session.input", {"session": session, "input": {"type": "back"}})
        exited = wait(
            self.client, lambda m: m.get("event") == "session.exited" and m.get("session") == session
        )
        self.assertEqual(exited.get("code"), 0)
        redrawn = OUT[before_exit:]
        if root_title:
            self.assertIn(f'view "{root_title}"', redrawn)
        self.assertIn(f"> {selected_root_row}", redrawn)
        self.shutdown()
        with self.client.ready:
            self.assertTrue(self.client.ready.wait_for(lambda: self.client.closed, 5))
        self.assertFalse(
            any(m.get("event") in ROOT_VIEW_EVENTS for m in self.client.events),
            self.client.events,
        )

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
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
            and m.get("session") == session
            and m["view"].get("kind") == "form",
        )["view"]
        self.assertEqual([field["id"] for field in form["form"]["fields"]], ["token", "argument:query"])
        # Submitting empty marks both required fields; nothing echoes the password.
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        invalid = wait(
            self.client,
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
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
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
            and m.get("session") == session
            and m["view"].get("form", {}).get("fields", [{}])[0].get("hasValue"),
        )
        self.client.request("session.input", {"session": session, "input": {"type": "primary"}})
        command = wait(
            self.client,
            lambda m: m.get("event") in SESSION_VIEW_EVENTS
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
