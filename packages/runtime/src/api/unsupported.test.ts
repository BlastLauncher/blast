import { expect, test } from "bun:test";
import { createElement } from "react";
import inventory from "../../../../compat/raycast-api.inventory.json" with { type: "json" };
import * as api from "./index.ts";
import * as implemented from "./implemented.ts";
import {
  UnsupportedApiError,
  unsupportedPath as unsupportedPathOf,
  withUnsupported,
} from "./unsupported.ts";
import { createSceneRoot } from "../reconciler/index.ts";

function unsupported(call: () => unknown, path: string) {
  try {
    call();
    throw new Error("Expected unsupported API");
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedApiError);
    expect(error).toMatchObject({ code: "UNSUPPORTED_API", path });
    expect((error as Error).message).toContain(path);
  }
}

// `Image` is the one type-kind top-level symbol with runtime members: the
// declarations merge its interface with the `Image.Mask` value namespace, so
// the shim exports it (the generated enum) alongside the type.
const RUNTIME_TYPES = new Set(["Image"]);

test("every value-level top-level inventory symbol is exported; types are absent", () => {
  const kinds = new Set(["namespace", "component", "function", "const", "class", "enum"]);
  for (const entry of inventory.entries.filter((candidate) => !candidate.path.includes("."))) {
    expect(Object.hasOwn(api, entry.path)).toBe(
      kinds.has(entry.kind) || RUNTIME_TYPES.has(entry.path),
    );
  }
});

test("top-level, nested and partially implemented component stubs name the exact path", () => {
  for (const [component, path] of [
    [api.WindowManagement, "WindowManagement"],
    [api.Action.Open!, "Action.Open"],
    [withUnsupported("ActionPanel", implemented.ActionPanel).Submenu!, "ActionPanel.Submenu"],
  ] as const) {
    const errors: unknown[] = [];
    const root = createSceneRoot({ publish() {}, onError: (error) => errors.push(error) });
    root.render(createElement(component));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({ code: "UNSUPPORTED_API", path });
  }
});

test("sync and promise-returning APIs throw structured errors when called", async () => {
  unsupported(() => api.getDefaultApplication("/tmp/file"), "getDefaultApplication");
  unsupported(() => api.clearSearchBar(), "clearSearchBar");
  await expect((async () => api.getDefaultApplication("/tmp/file"))()).rejects.toMatchObject({
    code: "UNSUPPORTED_API",
    path: "getDefaultApplication",
  });
});

test("implemented calls and values retain their behavior, and probes do not invent APIs", () => {
  const props = { navigationTitle: "Still implemented" };
  expect(api.List(props)).toEqual(implemented.List(props));
  expect(api.Action.CopyToClipboard({ content: "text" })).toMatchObject({
    type: "Action.CopyToClipboard",
    props: { title: "Copy to Clipboard", onAction: expect.any(Function) },
  });
  expect(api.getPreferenceValues()).toEqual(implemented.getPreferenceValues());
  expect(api.environment.raycastVersion).toBe(implemented.environment.raycastVersion);
  const live = { value: undefined as string | undefined };
  const wrapped = withUnsupported("live", live);
  expect(wrapped.value).toBeUndefined();
  live.value = "updated";
  expect(wrapped.value).toBe("updated");
  expect(api.Detail.Metadata).toBe(api.Detail.Metadata);
  expect(Reflect.get(api.Detail, "then")).toBeUndefined();
  expect(Reflect.get(api.List, "$$typeof")).toBeUndefined();
});

test("stub values used as props fail as unsupported instead of rendering as handlers", () => {
  const published: unknown[] = [];
  const root = createSceneRoot({ publish: (scene) => published.push(scene) });
  // Serialization runs at commit, so the error surfaces from render itself.
  unsupported(
    () =>
      root.render(
        createElement(
          api.List,
          {},
          createElement(api.List.Item, {
            title: "x",
            icon: api.Tool as unknown as string,
          }),
        ),
      ),
    "Tool",
  );
  expect(published).toEqual([]);
  // Implemented exports are not stubs, so their callbacks still become handlers.
  expect(unsupportedPathOf(api.List)).toBeUndefined();
  expect(unsupportedPathOf(api.Icon)).toBeUndefined();
});
