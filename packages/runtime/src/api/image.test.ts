import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot, type SceneNode } from "../reconciler/index.ts";
import { Action, Color, Icon, Image, ImageMask } from "./index.ts";
import type { ImageLike } from "./index.ts";

// @covers Image
// @covers Image.URL
// @covers Image.Asset
// @covers Image.ImageLike
// @covers Image.ImageLike.source
// @covers Image.ImageLike.fallback
// @covers Image.ImageLike.mask
// @covers Image.ImageLike.tintColor
// @covers Image.ImageLike.fileIcon
// @covers Image.Source
// @covers Image.Source.light
// @covers Image.Source.dark
// @covers Image.Fallback
// @covers Image.Fallback.light
// @covers Image.Fallback.dark
// @covers Image.source
// @covers Image.fallback
// @covers Image.mask
// @covers Image.tintColor
// @covers ImageMask
// @covers ImageMask.Circle
// @covers ImageMask.RoundedRectangle
test("Image exposes the mask values and the deprecated alias matches them", () => {
  // Image descends from the declarations' `Image.Mask` enum via the generator;
  // the deprecated `ImageMask` const carries the same values. The shim's
  // unsupported-API proxy wraps implemented exports, so compare structurally.
  expect(Image.Mask.Circle).toBe("circle");
  expect(Image).toEqual({ Mask: { Circle: "circle", RoundedRectangle: "roundedRectangle" } });
  expect(ImageMask.Circle).toBe(Image.Mask.Circle);
  expect(ImageMask.RoundedRectangle).toBe("roundedRectangle");
  expect(Object.keys(ImageMask).toSorted()).toEqual(["Circle", "RoundedRectangle"]);
});

/** Renders one `Action` icon and returns the serialized prop. */
function serializeIcon(icon: ImageLike): unknown {
  let scene: SceneSnapshot | undefined;
  const root = createSceneRoot({ publish: (next) => (scene = next) });
  root.render(h(Action, { title: "Icon", icon }));
  const node: SceneNode = scene!.root!;
  expect(node.type).toBe("Action");
  root.unmount();
  return node.props.icon;
}

test("every image-like shape reaches the scene exactly as authored", () => {
  // The shim never resolves images: a URL or asset stays the string an
  // extension passed, an `Icon` stays its name, and an `Image` object keeps
  // `source` (including the light/dark pair), `fallback`, `mask` and
  // `tintColor` as authored. Serializing the same value twice is identical.
  const icon: ImageLike = Icon.Circle;
  const url: ImageLike = "https://raycast.com/uploads/avatar.png";
  const asset: ImageLike = "avatar.png";
  const fileIcon: ImageLike = { fileIcon: "/tmp/main.ts" };
  const masked: ImageLike = { source: "avatar.png", mask: Image.Mask.Circle, tintColor: Color.Red };
  const themed: ImageLike = {
    source: { light: "light.png", dark: "dark.png" },
    fallback: { light: "fallback-light.png", dark: "fallback-dark.png" },
    tintColor: { light: "#FF01FF", dark: "#FFFF50", adjustContrast: true },
  };
  const explicitNulls: ImageLike = {
    source: Icon.Circle,
    fallback: null,
    mask: null,
    tintColor: null,
  };
  const cases: Array<[ImageLike, unknown]> = [
    [icon, Icon.Circle],
    [url, "https://raycast.com/uploads/avatar.png"],
    [asset, "avatar.png"],
    [fileIcon, { fileIcon: "/tmp/main.ts" }],
    [masked, { source: "avatar.png", mask: "circle", tintColor: "raycast-red" }],
    [
      themed,
      {
        source: { light: "light.png", dark: "dark.png" },
        fallback: { light: "fallback-light.png", dark: "fallback-dark.png" },
        tintColor: { light: "#FF01FF", dark: "#FFFF50", adjustContrast: true },
      },
    ],
    // `null` means "not set" to Raycast, and the scene carries it rather than
    // inventing an absent key, so a client sees the authored shape.
    [explicitNulls, { source: Icon.Circle, fallback: null, mask: null, tintColor: null }],
  ];
  for (const [value, expected] of cases) {
    const serialized = serializeIcon(value);
    expect(serialized).toEqual(expected);
    expect(serializeIcon(value)).toEqual(serialized);
  }
});
