import { describe, expect, test } from "bun:test";
import {
  browserLimitCapability,
  classifyBrowserOutcome,
  contentSelector,
  credentialFailure,
  formFieldSelector,
  placeholderPreferences,
  recordCapabilities,
  type CapabilityCall,
} from "./browser-sweep.ts";

describe("sweep selectors", () => {
  test("the settle marker recognizes grids, feedback and non-input form controls", () => {
    // Only `.rows` items and text inputs would leave pinch-svg/grid and
    // random-color/select-color reporting empty. An empty Detail is not
    // content either: leetcode/daily-challenge renders one before its fetch
    // fails and used to be snapshotted as empty at 381 ms.
    expect(contentSelector).toContain("#app .grid-cell");
    expect(contentSelector).toContain("#app form [data-field]");
    expect(contentSelector).toContain("#app .toast");
    expect(contentSelector).not.toContain("input[data-field]");
    expect(contentSelector).not.toContain("#app .detail");
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
    ).toBe("timeout");
  });
  test("a failure after a browser-limited capability is a browser limit", () => {
    // The extension's own message ("<App> is not installed", "No text to
    // process") does not matter; the capability log does.
    expect(
      classifyBrowserOutcome({
        browserLimit: "applications.list",
        statusError: true,
        status: "Some App is not installed.",
      }),
    ).toBe("browser-limit");
    expect(
      classifyBrowserOutcome({
        browserLimit: "selection.text",
        scene: { kind: "list", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("browser-limit");
    // The same request in a command that rendered or finished is no limit.
    expect(
      classifyBrowserOutcome({
        browserLimit: "applications.list",
        scene: { kind: "list", rows: 3, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("rendered");
    expect(classifyBrowserOutcome({ browserLimit: "open.url rectangle:", completed: true })).toBe(
      "completed",
    );
  });
  test("classifies network errors", () => {
    expect(classifyBrowserOutcome({ pageErrors: ["TypeError: Failed to fetch"] })).toBe(
      "browser-limit",
    );
    expect(classifyBrowserOutcome({ network: true })).toBe("browser-limit");
  });
  test("keeps real content when a background request fails", () => {
    // A command that draws its own UI while a lookup fails is still rendered;
    // the client's own "No results" placeholder is not content.
    expect(
      classifyBrowserOutcome({
        network: true,
        scene: { kind: "grid", rows: 0, cells: 389, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("rendered");
    expect(
      classifyBrowserOutcome({
        network: true,
        scene: { kind: "list", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: true },
      }),
    ).toBe("rendered");
    expect(
      classifyBrowserOutcome({
        network: true,
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
    ).toBe("browser-limit");
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
    expect(
      classifyBrowserOutcome({
        bundleFallbackFailed: true,
        statusError: true,
        status: "Failed to load bundle",
        consoleErrors: ["Failed to load resource: 404"],
      }),
    ).toBe("bundle-fallback-failed");
    expect(classifyBrowserOutcome({ timedOut: true })).toBe("timeout");
  });
  test("classifies a preference form", () => {
    expect(classifyBrowserOutcome({ needsPreferences: true })).toBe("needs-preferences");
  });
  test("a service refusing placeholder credentials needs credentials", () => {
    const refused = {
      placeholders: true,
      credentials: "HTTP 401 api.example.com",
      consoleErrors: ["Failed to load resource: the server responded with a status of 401 ()"],
    };
    expect(classifyBrowserOutcome(refused)).toBe("needs-credentials");
    // Without placeholders the same 401 is a failure to explain, not a setup step.
    expect(classifyBrowserOutcome({ ...refused, placeholders: false })).toBe(
      "runtime-error:Failed to load resource: the server responded with a status of 401 ()",
    );
    // A browser limit explains the failure first.
    expect(classifyBrowserOutcome({ ...refused, browserLimit: "selection.text" })).toBe(
      "browser-limit",
    );
    expect(
      classifyBrowserOutcome({
        ...refused,
        scene: { kind: "list", rows: 2, cells: 0, detail: false, fields: 0, hasEmptyView: false },
        consoleErrors: [],
      }),
    ).toBe("rendered-with-placeholders");
  });
  test("marks content rendered after placeholder preferences", () => {
    expect(
      classifyBrowserOutcome({
        placeholders: true,
        scene: { kind: "list", rows: 1, cells: 0, detail: false, fields: 0, hasEmptyView: false },
      }),
    ).toBe("rendered-with-placeholders");
  });
  test("classifies a settled empty scene with required arguments as missing-arguments", () => {
    expect(
      classifyBrowserOutcome({
        scene: { kind: "empty", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
        missingArguments: ["width", "height"],
      }),
    ).toBe("missing-arguments");
    // A command that renders anyway is rendered, not missing-arguments.
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "form",
          rows: 0,
          cells: 0,
          detail: false,
          fields: 2,
          hasEmptyView: false,
        },
        missingArguments: ["width", "height"],
      }),
    ).toBe("rendered");
    // A runtime or network failure stays the more specific outcome.
    expect(
      classifyBrowserOutcome({
        scene: { kind: "empty", rows: 0, cells: 0, detail: false, fields: 0, hasEmptyView: false },
        missingArguments: ["width"],
        statusError: true,
        status: "Width must be an integer",
      }),
    ).toBe("runtime-error:Width must be an integer");
  });
  test("a scene that is still loading is a timeout, not an empty command", () => {
    expect(
      classifyBrowserOutcome({
        scene: {
          kind: "list",
          rows: 0,
          cells: 0,
          detail: false,
          fields: 0,
          hasEmptyView: false,
          isLoading: true,
        },
      }),
    ).toBe("timeout");
  });
});

describe("browserLimitCapability", () => {
  test("names applications, denied selection and non-web URLs", () => {
    expect(browserLimitCapability([{ name: "applications.list", ok: true }])).toBe(
      "applications.list",
    );
    expect(
      browserLimitCapability([
        { name: "storage.get", ok: true },
        { name: "selection.text", ok: false, error: "Selection is unavailable in a browser tab" },
      ]),
    ).toBe("selection.text");
    expect(
      browserLimitCapability([{ name: "open.url", params: { url: "someapp://do?x=1" }, ok: true }]),
    ).toBe("open.url someapp:");
    expect(
      browserLimitCapability([{ name: "open.path", params: { path: "/tmp" }, ok: false }]),
    ).toBe("open.path");
  });
  test("ignores what a tab can do", () => {
    expect(
      browserLimitCapability([
        { name: "open.url", params: { url: "https://example.com" }, ok: true },
        { name: "clipboard.copy", ok: true },
        { name: "storage.get", ok: false, error: "storage.get requires a non-empty key" },
        { name: "unknown.thing", ok: false, error: "unknown.thing is not supported" },
      ]),
    ).toBeUndefined();
  });
});

describe("credentialFailure", () => {
  test("reports the first remote 401/403/404", () => {
    expect(
      credentialFailure([
        { status: 404, url: "http://127.0.0.1:4177/demo/bundles/x.js" },
        { status: 500, url: "https://api.example.com/a" },
        { status: 403, url: "https://api.example.com/b" },
      ]),
    ).toBe("HTTP 403 api.example.com");
    expect(credentialFailure([{ status: 404, url: "http://localhost/x" }])).toBeUndefined();
  });
});

const field = (name: string, type: string, extra: object = {}) => ({
  name,
  type,
  title: name,
  required: true,
  data: [],
  ...extra,
});
describe("placeholderPreferences", () => {
  test("uses the corpus smoke placeholders for required preferences", () => {
    expect(
      placeholderPreferences(
        {
          preferences: [
            field("token", "password"),
            field("unit", "dropdown", { data: [{ title: "C", value: "celsius" }] }),
          ],
          commands: {
            index: [field("verbose", "checkbox"), field("limit", "textfield", { default: "5" })],
          },
        },
        "index",
      ),
    ).toEqual({ limit: "5", token: "blast-smoke", unit: "celsius", verbose: false });
    expect(placeholderPreferences(undefined, "index")).toEqual({});
  });
});

describe("recordCapabilities", () => {
  test("pairs each request the port receives with the answer it posts", () => {
    class FakePort {
      listeners: ((event: { data: unknown }) => void)[] = [];
      posted: unknown[] = [];
      addEventListener(_type: unknown, listener: unknown) {
        this.listeners.push(listener as (event: { data: unknown }) => void);
      }
      postMessage(message: unknown) {
        this.posted.push(message);
      }
    }
    const scope: { MessagePort: typeof FakePort; blastSweepCapabilities?: CapabilityCall[] } = {
      MessagePort: FakePort,
    };
    recordCapabilities(scope);
    const port = new FakePort();
    const seen: unknown[] = [];
    port.addEventListener("message", (event: { data: unknown }) => seen.push(event.data));
    const request = { type: "capability.request", id: "1", name: "applications.list", params: {} };
    port.listeners[0]!({ data: request });
    port.listeners[0]!({ data: { type: "scene" } });
    port.postMessage({ type: "capability.result", id: "1", ok: true, value: [] });
    port.listeners[0]!({
      data: { type: "capability.request", id: "2", name: "selection.text", params: null },
    });
    port.postMessage({
      type: "capability.result",
      id: "2",
      ok: false,
      error: { code: "DENIED", message: "Selection is unavailable in a browser tab" },
    });
    expect(seen).toEqual([request, { type: "scene" }, expect.any(Object)]);
    expect(port.posted).toHaveLength(2);
    expect(scope.blastSweepCapabilities).toEqual([
      { name: "applications.list", params: {}, ok: true },
      {
        name: "selection.text",
        params: null,
        ok: false,
        error: "Selection is unavailable in a browser tab",
      },
    ]);
  });
});
