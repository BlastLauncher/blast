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
  expect(iconView("https://example.com/avatar.png").label).toBe("▣");
  expect(iconView({ source: { light: "moon-16", dark: "sun-16" } }).label).toBe("☾");
  expect(iconView({ fileIcon: "/tmp/report.pdf" }).label).toBe("▣");
  expect(iconView(undefined)).toEqual({ label: "◇" });
  expect(iconView({})).toEqual({ label: "◇" });
});

test("icons: an unknown name becomes a short label instead of raw markup", () => {
  expect(iconView("frobnicator-16").label).toBe("Frobnicator");
  expect(iconView("very-long-custom-icon-name-16").label).toBe("Very Long…");
  expect(iconView("/icons/unknown.svg").label).toBe("▣");
});

const tint = (tintColor: unknown, appearance?: "light" | "dark") =>
  iconView({ source: "star-16", tintColor } as never, appearance ? { appearance } : {}).tint;

test("icons: tint colours become palette roles and raw colours pass through", () => {
  expect(tint("raycast-red")).toBe("red");
  expect(tint("raycast-secondary-text")).toBe("secondary-text");
  expect(tint({ dark: "raycast-green", light: "red" }, "dark")).toBe("green");
  expect(tint({ dark: "raycast-green", light: "red" })).toBe("red");
  expect(tint("#ff0000")).toBe("#ff0000");
});

test("icons: FileIcon values keep their file placeholder", () => {
  expect(iconView({ fileIcon: "/tmp/report.pdf", source: "ignored" }).label).toBe("▣");
});

test("icons: every source kind says what to draw", () => {
  expect(iconView("add-16").source).toEqual({ kind: "builtin", name: "add-16" });
  expect(iconView({ source: "star-16" }).source).toEqual({ kind: "builtin", name: "star-16" });
  expect(iconView("https://example.com/a.png").source).toEqual({
    kind: "url",
    url: "https://example.com/a.png",
  });
  expect(iconView("data:image/png;base64,AAAA").source).toEqual({
    kind: "url",
    url: "data:image/png;base64,AAAA",
  });
  expect(iconView("/tmp/a.png").source).toEqual({ kind: "file", path: "/tmp/a.png" });
  expect(iconView("file:///tmp/my%20a.png").source).toEqual({
    kind: "file",
    path: "/tmp/my a.png",
  });
  expect(iconView({ fileIcon: "/tmp/report.pdf" }).source).toEqual({
    kind: "fileIcon",
    path: "/tmp/report.pdf",
  });
  expect(iconView(undefined).source).toBeUndefined();
});

test("icons: relative asset names resolve under the assets directory", () => {
  const assetsDir = "/ext/assets";
  expect(iconView("icon.png", { assetsDir }).source).toEqual({
    kind: "file",
    path: "/ext/assets/icon.png",
  });
  expect(iconView({ source: "./img/logo.svg" }, { assetsDir: "/ext/assets/" }).source).toEqual({
    kind: "file",
    path: "/ext/assets/img/logo.svg",
  });
  // Without a directory, or when the name climbs out of it, nothing is drawable.
  expect(iconView("icon.png").source).toBeUndefined();
  expect(iconView("../secret.png", { assetsDir }).source).toBeUndefined();
  expect(iconView("icon.png").label).toBe("▣");
});

test("icons: mask and tint ride along with the source", () => {
  expect(
    iconView({ source: "a.png", mask: "circle", tintColor: "raycast-blue" }, { assetsDir: "/a" }),
  ).toEqual({
    label: "▣",
    tint: "blue",
    source: { kind: "file", path: "/a/a.png" },
    mask: "circle",
  });
  expect(iconView({ source: "https://x.test/a.png", mask: "roundedRectangle" }).mask).toBe(
    "roundedRectangle",
  );
  expect(
    iconView({ source: "https://x.test/a.png", mask: "hexagon" as never }).mask,
  ).toBeUndefined();
});

test("icons: light and dark sources follow the appearance, light by default", () => {
  const value = { source: { light: "light.png", dark: "dark.png" } };
  const options = { assetsDir: "/a" };
  expect(iconView(value, options).source).toEqual({ kind: "file", path: "/a/light.png" });
  expect(iconView(value, { ...options, appearance: "dark" }).source).toEqual({
    kind: "file",
    path: "/a/dark.png",
  });
  expect(
    iconView({ source: { dark: "only-dark.png" } }, { ...options, appearance: "light" }).source,
  ).toEqual({ kind: "file", path: "/a/only-dark.png" });
});
