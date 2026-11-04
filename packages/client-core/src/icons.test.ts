import { expect, test } from "bun:test";
import { iconView } from "./icons.ts";

test("icons: Raycast icon names map to compact glyphs", () => {
  for (const [name, glyph] of [
    ["add-16", "+"],
    ["calendar-16", "▦"],
    ["magnifying-glass-16", "⌕"],
    ["copy-clipboard-16", "⧉"],
    ["check-circle-filled-16", "✓"],
    ["chevron-down-small-16", "⌄"],
    ["globe-01-16", "⊕"],
    ["info-01-16", "ⓘ"],
    ["star-disabled-16", "☆"],
    ["xmark-16", "×"],
    ["speech-bubble-16", "▤"],
  ] as const)
    expect(iconView(name).label).toBe(glyph);
});

test("icons: image sources, file icons and missing values have readable fallbacks", () => {
  expect(iconView("https://example.com/avatar.png")).toEqual({ label: "▣" });
  expect(iconView({ source: { light: "moon-16", dark: "sun-16" } })).toEqual({ label: "☀" });
  expect(iconView({ fileIcon: "/tmp/report.pdf" })).toEqual({ label: "▣" });
  expect(iconView(undefined)).toEqual({ label: "◇" });
  expect(iconView({})).toEqual({ label: "◇" });
});

test("icons: an unknown name becomes a short label instead of raw markup", () => {
  expect(iconView("frobnicator-16").label).toBe("Frobnicator");
  expect(iconView("very-long-custom-icon-name-16").label).toBe("Very Long…");
  expect(iconView("/icons/unknown.svg").label).toBe("▣");
});

test("icons: tint colours become palette roles and raw colours pass through", () => {
  expect(iconView({ source: "star-16", tintColor: "raycast-red" })).toEqual({
    label: "★",
    tint: "red",
  });
  expect(iconView({ source: "star-16", tintColor: "raycast-secondary-text" })).toEqual({
    label: "★",
    tint: "secondary-text",
  });
  expect(
    iconView({ source: "star-16", tintColor: { dark: "raycast-green", light: "red" } }),
  ).toEqual({ label: "★", tint: "green" });
  expect(iconView({ source: "star-16", tintColor: "#ff0000" })).toEqual({
    label: "★",
    tint: "#ff0000",
  });
});

test("icons: FileIcon values keep their file placeholder", () => {
  expect(iconView({ fileIcon: "/tmp/report.pdf", source: "ignored" }).label).toBe("▣");
});
