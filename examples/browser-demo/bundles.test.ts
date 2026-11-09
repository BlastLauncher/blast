import { describe, expect, test } from "bun:test";
import { bundleKey, bundleMatches, parseBundleIndex, sha256Hex } from "./bundles.ts";
import { extensionFilesFromTree } from "./prebuild.ts";

const bytes = new TextEncoder().encode("bundle");

test("bundle index schema accepts entries and rejects malformed values", () => {
  const sha256 = "e".repeat(64);
  expect(
    parseBundleIndex({
      buildSha: "abc",
      bundles: {
        "ratio-calculator/index": { path: "bundles/ratio-calculator/index.js", bytes: 6, sha256 },
      },
    }).buildSha,
  ).toBe("abc");
  expect(() =>
    parseBundleIndex({ buildSha: "abc", bundles: { bad: { path: "wrong.js", bytes: 1, sha256 } } }),
  ).toThrow("Invalid bundle entry shape");
});

test("prebuilt index round-trips extension and command preferences", () => {
  const index = parseBundleIndex({
    buildSha: "abc",
    bundles: {
      "humaans/holidays": {
        path: "bundles/humaans/holidays.js",
        bytes: 1,
        sha256: "e".repeat(64),
        manifest: {
          name: "humaans",
          preferences: [
            { name: "token", type: "password", title: "Token", required: true, data: [] },
          ],
          commands: {
            holidays: [
              {
                name: "calendar",
                type: "dropdown",
                title: "Calendar",
                required: false,
                data: [{ title: "Work", value: "work" }],
                default: "work",
              },
            ],
          },
        },
      },
    },
  });
  expect(index.bundles["humaans/holidays"]?.manifest).toEqual({
    name: "humaans",
    preferences: [{ name: "token", type: "password", title: "Token", required: true, data: [] }],
    commands: {
      holidays: [
        {
          name: "calendar",
          type: "dropdown",
          title: "Calendar",
          required: false,
          data: [{ title: "Work", value: "work" }],
          default: "work",
        },
      ],
    },
    modes: { holidays: "view" },
  });
});

test("prebuilt manifests preserve declared modes, default missing modes, and reject unknown modes", () => {
  const parsed = parseBundleIndex({
    buildSha: "abc",
    bundles: {
      "demo/declared": {
        path: "bundles/demo/declared.js",
        bytes: 1,
        sha256: "e".repeat(64),
        manifest: {
          name: "demo",
          preferences: [],
          commands: { declared: [], implicit: [] },
          modes: { declared: "menu-bar" },
        },
      },
    },
  });
  expect(parsed.bundles["demo/declared"]?.manifest?.modes).toEqual({
    declared: "menu-bar",
    implicit: "view",
  });
  expect(() =>
    parseBundleIndex({
      buildSha: "abc",
      bundles: {
        "demo/bad": {
          path: "bundles/demo/bad.js",
          bytes: 1,
          sha256: "e".repeat(64),
          manifest: {
            name: "demo",
            preferences: [],
            commands: { bad: [] },
            modes: { bad: "popup" },
          },
        },
      },
    }),
  ).toThrow("Invalid bundle manifest mode: demo/bad/bad");
});

test("prebuilt fast path requires the build, entry and digest to match", async () => {
  const sha256 = await sha256Hex(bytes.buffer);
  const index = parseBundleIndex({
    buildSha: "build",
    bundles: {
      [bundleKey("ratio-calculator", "index")]: {
        path: "bundles/ratio-calculator/index.js",
        bytes: bytes.byteLength,
        sha256,
      },
    },
  });
  expect(await bundleMatches(index, "build", "ratio-calculator/index", bytes.buffer)).toBe(true);
  expect(await bundleMatches(index, "stale", "ratio-calculator/index", bytes.buffer)).toBe(false);
  expect(await bundleMatches(index, "build", "missing/index", bytes.buffer)).toBe(false);
  expect(
    await bundleMatches(
      index,
      "build",
      "ratio-calculator/index",
      new TextEncoder().encode("changed").buffer,
    ),
  ).toBe(false);
  expect(await bundleMatches(undefined, "build", "ratio-calculator/index", bytes.buffer)).toBe(
    false,
  );
});

test("tree listing maps only files below the extension and excludes node_modules", () => {
  expect(
    extensionFilesFromTree(
      [
        { path: "extensions/ratio-calculator/package.json", type: "blob" },
        { path: "extensions/ratio-calculator/src/index.tsx", type: "blob" },
        { path: "extensions/ratio-calculator/node_modules/x/index.js", type: "blob" },
        { path: "extensions/other/index.ts", type: "blob" },
        { path: "extensions/ratio-calculator/src", type: "tree" },
      ],
      "extensions/ratio-calculator",
    ),
  ).toEqual(["package.json", "src/index.tsx"]);
});

describe("bundle key", () => {
  test("joins extension and command", () => expect(bundleKey("a", "b")).toBe("a/b"));
});
