import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
require.extensions[".svg"] = (module) => {
  module.exports = () => null;
};
const NodeModule = require("node:module");
const originalResolveFilename = Reflect.get(NodeModule, "_resolveFilename");
if (typeof originalResolveFilename !== "function") {
  throw new Error("Node module resolver is unavailable");
}
const svgStub = fileURLToPath(
  new URL("../dist/renderer/components/Icon/images/v2-scene-icon-test.svg", import.meta.url),
);
mkdirSync(fileURLToPath(new URL("../dist/renderer/components/Icon/images/", import.meta.url)), { recursive: true });
writeFileSync(svgStub, "");
Reflect.set(NodeModule, "_resolveFilename", (request, parent, isMain, options) =>
  request.endsWith(".svg")
    ? svgStub
    : Reflect.apply(originalResolveFilename, NodeModule, [request, parent, isMain, options]),
);

const {
  V2SceneIcon,
  adjustV2SceneColorContrast,
  selectV2SceneIconTint,
  selectV2SceneImageSource,
  v2SceneIconContrastRatio,
} = await import("../dist/renderer/V2SceneIcon.js");
Reflect.set(NodeModule, "_resolveFilename", originalResolveFilename);
rmSync(svgStub, { force: true });

test("prefers dark registered assets and falls back to another renderable source", () => {
  const darkNode = {
    id: "dark",
    type: "list-item",
    props: { icon: "circle-16", iconDark: "app-window-16" },
    children: [],
  };
  assert.equal(selectV2SceneImageSource(darkNode), "app-window-16");

  const fallbackNode = {
    id: "fallback",
    type: "list-item",
    props: { icon: "missing-light", iconDark: "missing-dark", iconFallbackDark: "circle-16" },
    children: [],
  };
  assert.equal(selectV2SceneImageSource(fallbackNode), "circle-16");
  const markup = renderToStaticMarkup(React.createElement(V2SceneIcon, { node: fallbackNode }));
  assert.match(markup, /data-v2-icon-source="circle-16"/);
});

test("renders grid content and normalizes raw SVG data sources", () => {
  const contentNode = {
    id: "content",
    type: "grid-item",
    props: { content: "data:image/svg+xml,<svg><path/></svg>" },
    children: [],
  };
  const markup = renderToStaticMarkup(
    React.createElement(V2SceneIcon, { kind: "content", node: contentNode, size: "large" }),
  );
  assert.match(markup, /data-v2-icon-kind="content"/);
  assert.match(markup, /data-v2-icon-source="data:image\/svg\+xml,&lt;svg&gt;&lt;path\/&gt;&lt;\/svg&gt;"/);
  assert.match(markup, /src="data:image\/svg\+xml,%3Csvg%3E%3Cpath%2F%3E%3C%2Fsvg%3E"/);
  assert.match(markup, /h-10 w-10/);
});

test("retains a deterministic letter fallback for unknown sources", () => {
  const node = { id: "unknown", type: "list-item", props: { icon: "custom-icon" }, children: [] };
  const markup = renderToStaticMarkup(React.createElement(V2SceneIcon, { node, size: "small" }));
  assert.match(markup, /data-v2-icon-kind="icon"/);
  assert.match(markup, />C<\/span>/);
  assert.match(markup, /h-4 w-4/);
});

test("presents masks and theme-aware tints without injecting unsafe CSS", () => {
  const node = {
    id: "tinted",
    type: "list-item",
    props: {
      icon: "circle-16",
      iconMask: "circle",
      iconTintColor: "raycast-red",
      iconTintColorDark: "#abcdef",
      iconTintColorAdjustContrast: true,
    },
    children: [],
  };
  assert.deepEqual(selectV2SceneIconTint(node), {
    light: "raycast-red",
    dark: "#abcdef",
    adjustContrast: true,
  });
  const markup = renderToStaticMarkup(React.createElement(V2SceneIcon, { node }));
  assert.match(markup, /data-v2-icon-mask="circle"/);
  assert.match(markup, /data-v2-icon-tinted="true"/);
  assert.match(markup, /data-v2-icon-tint="raycast-red"/);
  assert.match(markup, /data-v2-icon-tint-adjust-contrast="true"/);
  assert.match(markup, /--v2-icon-tint-light:#f76060/);
  assert.match(markup, /--v2-icon-tint-dark:#abcdef/);

  const unsafeMarkup = renderToStaticMarkup(
    React.createElement(V2SceneIcon, {
      node: {
        ...node,
        id: "unsafe",
        props: { ...node.props, iconTintColor: "red; background: url(https://bad.invalid)" },
      },
    }),
  );
  assert.doesNotMatch(unsafeMarkup, /--v2-icon-tint-light/);
  assert.match(unsafeMarkup, /data-v2-icon-tint="red; background: url\(https:\/\/bad.invalid\)"/);
});

test("adjusts parseable colors to the active canvas contrast and preserves opt-outs", () => {
  const adjustedLight = adjustV2SceneColorContrast("#eeeeee", "light");
  const adjustedDark = adjustV2SceneColorContrast("#111111", "dark");
  assert.notEqual(adjustedLight, "#eeeeee");
  assert.notEqual(adjustedDark, "#111111");
  assert.ok((v2SceneIconContrastRatio(adjustedLight, "light") ?? 0) >= 3);
  assert.ok((v2SceneIconContrastRatio(adjustedDark, "dark") ?? 0) >= 3);
  assert.equal(adjustV2SceneColorContrast("var(--gray12)", "light"), "var(--gray12)");
  for (const value of ["rgb(238, 238, 238)", "rgba(238, 238, 238, 1)", "hsl(0, 0%, 93%)", "pink"]) {
    const adjusted = adjustV2SceneColorContrast(value, "light");
    assert.ok((v2SceneIconContrastRatio(adjusted, "light") ?? 0) >= 3, value);
  }

  const optOutMarkup = renderToStaticMarkup(
    React.createElement(V2SceneIcon, {
      node: {
        id: "opt-out",
        type: "list-item",
        props: {
          icon: "circle-16",
          iconTintColor: "#eeeeee",
          iconTintColorAdjustContrast: false,
        },
        children: [],
      },
    }),
  );
  assert.match(optOutMarkup, /--v2-icon-tint-light:#eeeeee/);
  assert.doesNotMatch(optOutMarkup, /data-v2-icon-tint-adjust-contrast="true"/);
});

test("applies content-prefixed masks and tints to external images", () => {
  const node = {
    id: "content-image",
    type: "grid-item",
    props: {
      content: "https://example.test/content.png",
      contentMask: "roundedRectangle",
      contentTintColor: "rgb(10, 20, 30)",
    },
    children: [],
  };
  const markup = renderToStaticMarkup(React.createElement(V2SceneIcon, { kind: "content", node, size: "large" }));
  assert.match(markup, /data-v2-icon-kind="content"/);
  assert.match(markup, /data-v2-icon-mask="roundedRectangle"/);
  assert.match(markup, /rounded-\[20%\]/);
  assert.match(markup, /grayscale/);
  assert.match(markup, /mix-blend-mode:color/);
  assert.match(markup, /src="https:\/\/example.test\/content.png"/);
});
