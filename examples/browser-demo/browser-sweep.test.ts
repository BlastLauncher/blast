import { describe, expect, test } from "bun:test";
import { classifyBrowserOutcome, contentSelector, formFieldSelector } from "./browser-sweep.ts";

describe("sweep selectors", () => {
  test("the settle marker recognizes grids and non-input form controls", () => {
    // Only `.rows` items and text inputs would leave pinch-svg/grid and
    // random-color/select-color reporting empty.
    expect(contentSelector).toContain("#app .grid-cell");
    expect(contentSelector).toContain("#app form [data-field]");
    expect(contentSelector).not.toContain("input[data-field]");
  });
  test("the snapshot counts every data-field control", () => {
    expect(formFieldSelector).toBe("form [data-field]");
  });
});

describe("classifyBrowserOutcome", () => {
  test("classifies rendered list and detail scenes", () => {
    for (const scene of [
      { kind: "list", rows: 1, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      { kind: "detail", rows: 0, cells: 0, detail: true, fields: 0, hasEmptyView: false },
    ])
      expect(classifyBrowserOutcome({ scene })).toBe("rendered");
  });
  test("classifies completed no-view commands and menus with items", () => {
    expect(classifyBrowserOutcome({ completed: true })).toBe("completed");
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "menu-bar",
          rows: 0,
          cells: 0,
          detail: false,
          fields: 0,
          hasEmptyView: false,
          menuRows: 2,
        },
      }),
    ).toBe("rendered");
  });
  test("does not count root rows or unfinished no-view sessions as content", () => {
    expect(
      classifyBrowserOutcome({
        scene: { kind: "root", rows: 42, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("empty");
    expect(
      classifyBrowserOutcome({
        scene: { kind: "list", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("empty");
  });
  test("counts grid cells as content", () => {
    expect(
      classifyBrowserOutcome({
        scene: { kind: "grid", rows: 0, cells: 6, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("rendered");
    expect(
      classifyBrowserOutcome({
        scene: { kind: "grid", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("empty");
  });
  test("counts a form whose only control is a text area or dropdown", () => {
    // The snapshot counts every [data-field] control, so a text area or select
    // without a plain text input still makes the form rendered.
    expect(
      classifyBrowserOutcome({
        scene: { kind: "form", rows: 0, cells: 0, detail: false, fields: 1, hasEmptyView: false },
      }),
    ).toBe("rendered");
  });
  test("distinguishes an empty scene from an explicit empty view", () => {
    expect(
      classifyBrowserOutcome({
        scene: { kind: "list", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("empty");
    expect(
      classifyBrowserOutcome({
        scene: { kind: "list", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: true },
      }),
    ).toBe("rendered");
  });
  test("classifies a settled search-first List as rendered", () => {
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "list",
          rows: 0,
          cells: 0,
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
          cells: 0,
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
      "runtime-error:Failed to load resource: 404",
    );
  });
  test("classifies bundle fallback failure and timeout", () => {
    expect(classifyBrowserOutcome({ bundleFallbackFailed: true })).toBe("bundle-fallback-failed");
    expect(classifyBrowserOutcome({ timedOut: true })).toBe("timeout");
  });
  test("classifies a preference form", () => {
    expect(classifyBrowserOutcome({ needsPreferences: true })).toBe("needs-preferences");
  });
});
