import { afterEach, expect, test } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import { createSceneRoot } from "../reconciler/index.ts";
import { Action, ActionPanel, List, randomId, render, useActionPanel, useId } from "./index.ts";
import type { ActionPanelState } from "./index.ts";
import { currentActionPanel } from "./action-panel.ts";
import { setRenderMount } from "./legacy.ts";

afterEach(() => setRenderMount(undefined));

// @covers randomId
test("randomId returns a unique id per call", () => {
  const ids = Array.from({ length: 100 }, () => randomId());
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// @covers useId
test("useId is stable across renders and unique per component instance", () => {
  const ids: Record<string, string> = {};
  function A() {
    ids["a"] = useId();
    return h(List.Item, { title: "A" });
  }
  function B() {
    ids["b"] = useId();
    return h(List.Item, { title: "B" });
  }
  const root = createSceneRoot({ publish() {} });
  root.render(h(List, null, h(A), h(B)));
  const first = { ...ids };
  expect(first["a"]).not.toBe(first["b"]);
  root.render(h(List, null, h(A), h(B)));
  expect(ids).toEqual(first);
  // A fresh instance gets a fresh id.
  root.render(null);
  root.render(h(List, null, h(A)));
  expect(ids["a"]).not.toBe(first["a"]);
  root.unmount();
});

// @covers render
test("render hands the element to the installed command-root mounter", () => {
  const mounted: ReactNode[] = [];
  setRenderMount((element) => mounted.push(element));
  const element = h(List, { navigationTitle: "Legacy" });
  render(element);
  expect(mounted).toEqual([element]);
  setRenderMount(undefined);
  expect(() => render(element)).toThrow("render: no command root is mounted");
});

// @covers useActionPanel
// @covers ActionPanelState
// @covers ActionPanelState.update
test("useActionPanel keeps the last panel a legacy command installed", () => {
  let state: ActionPanelState | undefined;
  let renders = 0;
  function Legacy() {
    renders++;
    state = useActionPanel();
    return h(List, { navigationTitle: "Legacy" });
  }
  const root = createSceneRoot({ publish() {} });
  root.render(h(Legacy));
  const installed = state!;
  const first = h(ActionPanel, null, h(Action, { title: "Open" }));
  installed.update(first);
  expect(currentActionPanel()).toBe(first);
  const second = h(ActionPanel, null, h(Action, { title: "Close" }));
  installed.update(second);
  expect(currentActionPanel()).toBe(second);
  // The state object is stable, so legacy code can use it in hook dependencies.
  root.render(h(Legacy));
  expect(renders).toBe(2);
  expect(state).toBe(installed);
  installed.update(null);
  expect(currentActionPanel()).toBeNull();
  root.unmount();
});
