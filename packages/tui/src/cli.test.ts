import { expect, test } from "bun:test";
import { parseCliArgs } from "./cli.ts";

const dirs = new Set(["ext-a", "ext-b", "ext-c"]);
const parse = (...argv: string[]) => parseCliArgs(argv, (path) => dirs.has(path));

test("several extension dirs open one root, with --popup and --native anywhere", () => {
  expect(parse("--popup", "ext-a", "ext-b", "--native", "ext-c")).toEqual({
    kind: "root",
    extensionDirs: ["ext-a", "ext-b", "ext-c"],
    popup: true,
    daemon: false,
    native: true,
  });
  expect(parse("--popup-daemon", "ext-a")).toEqual({
    kind: "root",
    extensionDirs: ["ext-a"],
    popup: true,
    daemon: true,
    native: false,
  });
  expect(parse("ext-a")).toEqual({
    kind: "root",
    extensionDirs: ["ext-a"],
    popup: false,
    daemon: false,
    native: false,
  });
});

test("one dir plus a name that is not a directory opens that command", () => {
  expect(parse("ext-a", "index", "--native")).toEqual({
    kind: "command",
    extensionDir: "ext-a",
    command: "index",
    native: true,
  });
  expect(parse("ext-a", "ext-b")).toMatchObject({
    kind: "root",
    extensionDirs: ["ext-a", "ext-b"],
  });
});

test("missing dirs, unknown options and --popup with a command print usage", () => {
  expect(parse()).toEqual({
    kind: "root",
    extensionDirs: [],
    popup: false,
    daemon: false,
    native: false,
  });
  expect(parse("--no-builtin")).toEqual({ kind: "usage", error: "Missing <extensionDir>" });
  expect(parse("--verbose", "ext-a")).toEqual({
    kind: "usage",
    error: "Unknown option: --verbose",
  });
  expect(parse("--popup", "ext-a", "index")).toMatchObject({ kind: "usage" });
  expect(parse("--popup-daemon", "ext-a", "index")).toMatchObject({ kind: "usage" });
  expect(parse("--help")).toEqual({ kind: "usage" });
});

test("version and builtin flags are accepted", () => {
  expect(parse("--version")).toEqual({ kind: "version" });
  expect(parse("--no-builtin", "ext-a")).toEqual({
    kind: "root",
    extensionDirs: ["ext-a"],
    popup: false,
    daemon: false,
    native: false,
  });
});
