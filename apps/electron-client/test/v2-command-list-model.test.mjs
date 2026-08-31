import assert from "node:assert/strict";
import test from "node:test";

const { clampV2CommandSelection, filterV2Commands, moveV2CommandSelection } =
  await import("../dist/renderer/v2CommandListModel.js");

const commands = [
  {
    extensionId: "weather",
    commandName: "current",
    title: "Current weather",
    extensionName: "Weather",
  },
  {
    extensionId: "notes",
    commandName: "search",
    title: "Search notes",
    extensionName: "Notes",
  },
  {
    extensionId: "calendar",
    commandName: "agenda",
    title: "Agenda",
    extensionName: "Calendar",
  },
];

test("filters by title, extension metadata, identifiers, and whitespace-insensitive queries", () => {
  assert.deepEqual(
    filterV2Commands(commands, "  WEATHER ").map((command) => command.commandName),
    ["current"],
  );
  assert.deepEqual(
    filterV2Commands(commands, "notes").map((command) => command.commandName),
    ["search"],
  );
  assert.deepEqual(
    filterV2Commands(commands, "agenda").map((command) => command.commandName),
    ["agenda"],
  );
  assert.strictEqual(filterV2Commands(commands, ""), commands);
  assert.deepEqual(filterV2Commands(commands, "missing"), []);
});

test("clamps selections for empty and changing command lists", () => {
  assert.equal(clampV2CommandSelection(4, 3), 2);
  assert.equal(clampV2CommandSelection(-1, 3), 0);
  assert.equal(clampV2CommandSelection(4, 0), 0);
  assert.equal(clampV2CommandSelection(1, 0), 0);
});

test("wraps keyboard selection at both list edges", () => {
  assert.equal(moveV2CommandSelection(0, "previous", 3), 2);
  assert.equal(moveV2CommandSelection(2, "next", 3), 0);
  assert.equal(moveV2CommandSelection(99, "next", 3), 0);
  assert.equal(moveV2CommandSelection(-99, "previous", 3), 2);
  assert.equal(moveV2CommandSelection(0, "next", 0), 0);
});
