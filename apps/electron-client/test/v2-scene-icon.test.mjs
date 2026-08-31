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
const svgStub = fileURLToPath(new URL("../dist/renderer/components/Icon/images/add-person-16.svg", import.meta.url));
mkdirSync(fileURLToPath(new URL("../dist/renderer/components/Icon/images/", import.meta.url)), { recursive: true });
writeFileSync(svgStub, "");
Reflect.set(NodeModule, "_resolveFilename", (request, parent, isMain, options) =>
  request.endsWith(".svg")
    ? svgStub
    : Reflect.apply(originalResolveFilename, NodeModule, [request, parent, isMain, options]),
);

const { V2SceneIcon, selectV2SceneImageSource } = await import("../dist/renderer/V2SceneIcon.js");
Reflect.set(NodeModule, "_resolveFilename", originalResolveFilename);
rmSync(svgStub);

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
