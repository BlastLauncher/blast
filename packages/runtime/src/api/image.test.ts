import { expect, test } from "bun:test";
import { Image, ImageMask } from "./index.ts";

// @covers Image partial
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
