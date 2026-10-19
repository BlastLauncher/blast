import { expect, test } from "bun:test";
import {
  commandRow,
  filterCommands,
  missingRequired,
  parseManifest,
  type PickerCommand,
} from "./picker.ts";

const command = (overrides: Record<string, unknown> = {}): PickerCommand =>
  parseManifest({
    name: "ext",
    commands: [{ name: "index", ...overrides }],
  }).commands[0]!;

test("parseManifest fills defaults for title, mode and arguments", () => {
  const manifest = parseManifest({
    name: "ext",
    title: "Extension",
    commands: [
      {
        name: "index",
        title: "Index",
        subtitle: "Sub",
        mode: "menu-bar",
        arguments: [
          { name: "query", type: "text", placeholder: "Search", required: true },
          { name: "secret", type: "password" },
          {
            name: "choice",
            type: "dropdown",
            data: [{ title: "One", value: "one" }, { value: "two" }, { title: "Broken" }],
          },
        ],
      },
    ],
  });
  expect(manifest).toEqual({
    name: "ext",
    title: "Extension",
    commands: [
      {
        name: "index",
        title: "Index",
        subtitle: "Sub",
        description: "",
        mode: "menu-bar",
        arguments: [
          {
            name: "query",
            type: "text",
            required: true,
            placeholder: "Search",
            data: [],
          },
          { name: "secret", type: "password", required: false, placeholder: "", data: [] },
          {
            name: "choice",
            type: "dropdown",
            required: false,
            placeholder: "",
            data: [
              { title: "One", value: "one" },
              { title: "two", value: "two" },
            ],
          },
        ],
      },
    ],
  });
});

test("parseManifest defaults mode to view and title to the command name", () => {
  expect(command()).toMatchObject({ name: "index", title: "index", mode: "view" });
});

test("parseManifest rejects a missing commands array and unknown types", () => {
  expect(() => parseManifest({ name: "ext" })).toThrow('manifest needs a "commands" array');
  expect(() => parseManifest({ name: "ext", commands: [{ name: "a", mode: "wat" }] })).toThrow(
    "unknown mode",
  );
  expect(() =>
    parseManifest({
      name: "ext",
      commands: [{ name: "a", arguments: [{ name: "x", type: "bool" }] }],
    }),
  ).toThrow("unknown type");
});

test("filterCommands matches title, subtitle and name case-insensitively", () => {
  const commands = [
    command({ name: "index", title: "Top Level" }),
    command({ name: "detail", subtitle: "Show More" }),
    command({ name: "env" }),
  ];
  expect(filterCommands(commands, "").map((item) => item.name)).toEqual(["index", "detail", "env"]);
  expect(filterCommands(commands, "top").map((item) => item.name)).toEqual(["index"]);
  expect(filterCommands(commands, "MORE").map((item) => item.name)).toEqual(["detail"]);
  expect(filterCommands(commands, "env").map((item) => item.name)).toEqual(["env"]);
  expect(filterCommands(commands, "nothing")).toEqual([]);
});

test("commandRow shows title, subtitle else description, and mode", () => {
  expect(commandRow(command({ name: "index", title: "Index" }))).toBe("Index  [view]");
  expect(commandRow(command({ name: "close", subtitle: "Bye", mode: "no-view" }))).toBe(
    "close  Bye  [no-view]",
  );
  expect(commandRow(command({ name: "meta", description: "Metadata", mode: "menu-bar" }))).toBe(
    "meta  Metadata  [menu-bar]",
  );
});

test("missingRequired lists unfilled required argument names", () => {
  const args = command({
    name: "index",
    arguments: [
      { name: "query", type: "text", required: true },
      { name: "secret", type: "password", required: true },
      { name: "choice", type: "dropdown" },
    ],
  }).arguments;
  expect(missingRequired(args, {})).toEqual(["query", "secret"]);
  expect(missingRequired(args, { query: "hi" })).toEqual(["secret"]);
  expect(missingRequired(args, { query: "hi", secret: "", choice: "one" })).toEqual(["secret"]);
});
