import { expect, test } from "bun:test";
import { missingRequired, parseManifest, type ExtensionCommand } from "./extension-manifest.ts";

const command = (overrides: Record<string, unknown> = {}): ExtensionCommand =>
  parseManifest({
    name: "ext",
    commands: [{ name: "index", ...overrides }],
  }).commands[0]!;

test("parseManifest fills defaults for title, mode and arguments", () => {
  const manifest = parseManifest({
    name: "ext",
    title: "Extension",
    preferences: [],
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
    preferences: [],
    commands: [
      {
        name: "index",
        title: "Index",
        subtitle: "Sub",
        description: "",
        preferences: [],
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
