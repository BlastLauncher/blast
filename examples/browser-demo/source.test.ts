import { expect, test } from "bun:test";
import { parseExtensionSource } from "./source.ts";

test("parses a full GitHub extension URL", () => {
  expect(parseExtensionSource("https://github.com/acme/tools/tree/v1/extensions/demo")).toEqual({
    kind: "github",
    owner: "acme",
    repo: "tools",
    ref: "v1",
    path: "extensions/demo",
  });
});

test("parses a bare name as the Raycast extensions repository", () => {
  expect(parseExtensionSource("ratio-calculator")).toEqual({
    kind: "github",
    owner: "raycast",
    repo: "extensions",
    ref: "main",
    path: "extensions/ratio-calculator",
  });
});

test("rejects non-GitHub and incomplete URLs", () => {
  expect(() => parseExtensionSource("https://example.com/a/b/tree/main/extensions/demo")).toThrow();
  expect(() => parseExtensionSource("https://github.com/acme/tools")).toThrow();
});
