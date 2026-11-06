import { describe, expect, test } from "bun:test";
import { classifyBrowserOutcome } from "./browser-sweep.ts";

describe("classifyBrowserOutcome", () => {
  test("classifies rendered list, detail, form and grid scenes", () => {
    for (const scene of [
      { kind: "list", rows: 1, detail: false, fields: 0, hasEmptyView: false },
      { kind: "detail", rows: 0, detail: true, fields: 0, hasEmptyView: false },
      { kind: "form", rows: 0, detail: false, fields: 1, hasEmptyView: false },
      { kind: "grid", rows: 1, detail: false, fields: 0, hasEmptyView: false },
    ])
      expect(classifyBrowserOutcome({ scene })).toBe("rendered");
  });
  test("distinguishes an empty scene from an explicit empty view", () => {
    expect(
      classifyBrowserOutcome({
        scene: { kind: "list", rows: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("empty");
    expect(
      classifyBrowserOutcome({
        scene: { kind: "list", rows: 0, detail: false, fields: 0, hasEmptyView: true },
      }),
    ).toBe("rendered");
  });
  test("classifies a settled search-first List as rendered", () => {
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "list",
          rows: 0,
          detail: false,
          fields: 0,
          hasEmptyView: false,
          hasSearchBar: true,
          isLoading: false,
        },
      }),
    ).toBe("rendered");
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "list",
          rows: 0,
          detail: false,
          fields: 0,
          hasEmptyView: false,
          hasSearchBar: true,
          isLoading: true,
        },
      }),
    ).toBe("empty");
  });
  test("classifies capability denials with their name", () => {
    expect(classifyBrowserOutcome({ capability: "clipboard.copy", statusError: true })).toBe(
      "capability-denied:clipboard.copy",
    );
  });
  test("classifies network errors", () => {
    expect(classifyBrowserOutcome({ pageErrors: ["TypeError: Failed to fetch"] })).toBe("network");
    expect(classifyBrowserOutcome({ network: true })).toBe("network");
  });
  test("keeps only the first runtime error line", () => {
    expect(classifyBrowserOutcome({ statusError: true, status: "Boom\nsecond line" })).toBe(
      "runtime-error:Boom",
    );
    expect(classifyBrowserOutcome({ consoleErrors: ["Failed to load resource: 404"] })).toBe(
      "timeout",
    );
  });
  test("classifies bundle fallback failure and timeout", () => {
    expect(classifyBrowserOutcome({ bundleFallbackFailed: true })).toBe("bundle-fallback-failed");
    expect(classifyBrowserOutcome({ timedOut: true })).toBe("timeout");
  });
});
