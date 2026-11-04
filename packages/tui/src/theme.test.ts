import { expect, test } from "bun:test";
import { createTheme } from "./theme.ts";

test("the colourless palette keeps semantic glyphs for selection and errors", () => {
  const palette = createTheme(true);
  expect(palette.colors.text).toBeUndefined();
  expect(palette.colors.danger).toBeUndefined();
  expect(palette.glyphs.pointer).toBe("›");
  expect(palette.glyphs.rule).toBe("─");
});

test("16 and 256 colour palettes retain distinct semantic roles", () => {
  const palette = createTheme(false);
  expect(palette.colors.selectionBg).not.toBe(palette.colors.background);
  expect(palette.colors.danger).not.toBe(palette.colors.text);
});
