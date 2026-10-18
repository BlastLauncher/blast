import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { NavigationProvider } from "./navigation.ts";
import { closeMainWindow, PopToRootType } from "./window.ts";

function setup() {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  root.render(h(NavigationProvider, { children: h("List", {}) }));
  return { root, latest: () => scene };
}

// @covers closeMainWindow
// @covers PopToRootType
// @covers PopToRootType.Default
// @covers PopToRootType.Immediate
// @covers PopToRootType.Suspended
test("closeMainWindow records the request on the Navigation node and resolves", async () => {
  const { root, latest } = setup();
  expect(latest().root!.type).toBe("Navigation");
  // An open window leaves no flag on the scene.
  expect(latest().root!.props).toEqual({ depth: 1 });
  await closeMainWindow();
  root.flush();
  expect(latest().root!.props).toEqual({ depth: 1, closeMainWindow: {} });
  await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  root.flush();
  expect(latest().root!.props).toEqual({
    depth: 1,
    closeMainWindow: { clearRootSearch: true, popToRootType: "immediate" },
  });
  expect(PopToRootType).toEqual({
    Default: "default",
    Immediate: "immediate",
    Suspended: "suspended",
  });
  root.unmount();
});

// @covers closeMainWindow
test("the request is dropped with its scene, so a later command starts open", async () => {
  const first = setup();
  await closeMainWindow({ clearRootSearch: true });
  first.root.flush();
  expect(first.latest().root!.props.closeMainWindow).toEqual({ clearRootSearch: true });
  first.root.unmount();
  const second = setup();
  expect(second.latest().root!.props).toEqual({ depth: 1 });
  second.root.unmount();
});
