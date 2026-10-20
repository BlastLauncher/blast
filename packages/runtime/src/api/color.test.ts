import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, Color, Icon } from "./index.ts";
import type { ColorDynamic, ColorLike } from "./index.ts";

/** Renders one tinted icon and returns the serialized `tintColor`. */
function serializeTint(tintColor: ColorLike): unknown {
  let scene: SceneSnapshot | undefined;
  const root = createSceneRoot({ publish: (next) => (scene = next) });
  root.render(h(Action, { title: "Tint", icon: { source: Icon.Circle, tintColor } }));
  const serialized = scene!.root!.props.icon as { tintColor: unknown };
  root.unmount();
  return serialized.tintColor;
}

// @covers Color.Raw
// @covers Color.Dynamic
// @covers Color.Dynamic.light
// @covers Color.Dynamic.dark
// @covers Color.Dynamic.adjustContrast
// @covers Color.ColorLike
// @covers Color.ColorLike.light
// @covers Color.ColorLike.dark
// @covers Color.ColorLike.adjustContrast
test("color-likes keep their authored shape: built-in, literal or dynamic", () => {
  const raw: ColorLike = "#FF0000";
  const dynamic: ColorLike = { light: "#FF01FF", dark: "#FFFF50" };
  const adjusted: ColorLike = {
    light: "rgb(255, 0, 0)",
    dark: "hsla(200, 20%, 33%, 0.2)",
    adjustContrast: true,
  };
  const cases: Array<[ColorLike, unknown]> = [
    [Color.Red, "raycast-red"],
    [raw, "#FF0000"],
    [dynamic, { light: "#FF01FF", dark: "#FFFF50" }],
    [adjusted, { light: "rgb(255, 0, 0)", dark: "hsla(200, 20%, 33%, 0.2)", adjustContrast: true }],
  ];
  for (const [value, expected] of cases) {
    const serialized = serializeTint(value);
    expect(serialized).toEqual(expected);
    expect(serializeTint(value)).toEqual(serialized);
  }
});

// @covers Color.Brown
// @covers Color.Brown.light
// @covers Color.Brown.dark
// @covers Color.Brown.adjustContrast
test("Color.Brown is the deprecated dynamic brown pair", () => {
  // The declarations carry no value for the deprecated color; it uses Apple's
  // documented system brown pair and adjusts no contrast.
  const brown: ColorDynamic = Color.Brown;
  expect(brown.light).toBe("#A2845E");
  expect(brown.dark).toBe("#AC8E68");
  expect("adjustContrast" in brown).toBe(false);
  expect(serializeTint(Color.Brown)).toEqual({ light: "#A2845E", dark: "#AC8E68" });
});
