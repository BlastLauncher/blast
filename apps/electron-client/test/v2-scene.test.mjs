import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
require.extensions[".scss"] = () => {};
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

const markdownStylesheet = fileURLToPath(new URL("../dist/renderer/components/Detail/markdown.scss", import.meta.url));
mkdirSync(fileURLToPath(new URL("../dist/renderer/components/Detail/", import.meta.url)), { recursive: true });
writeFileSync(markdownStylesheet, "");
const { V2Scene } = await import("../dist/renderer/V2Scene.js");
Reflect.set(NodeModule, "_resolveFilename", originalResolveFilename);
rmSync(markdownStylesheet);
rmSync(svgStub);

test("server-renders menu-bar scenes with nested controls and shortcut labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "root",
        type: "menu-bar-extra",
        props: { title: "Blast", tooltip: "Blast menu", icon: "circle-16" },
        children: [
          {
            id: "section",
            type: "menu-bar-section",
            props: { title: "Actions" },
            children: [
              {
                id: "item",
                type: "menu-bar-item",
                props: {
                  title: "Open",
                  shortcut: { modifiers: ["cmd"], key: "K" },
                  onAction: "event-primary",
                },
                children: [
                  {
                    id: "alternate",
                    type: "menu-bar-item",
                    props: { title: "Open alternate", isAlternate: true, onAction: "event-alternate" },
                    children: [],
                  },
                ],
              },
              {
                id: "submenu",
                type: "menu-bar-submenu",
                props: { title: "More" },
                children: [
                  {
                    id: "settings",
                    type: "menu-bar-item",
                    props: { title: "Settings", onAction: "event-settings" },
                    children: [],
                  },
                ],
              },
            ],
          },
          { id: "separator", type: "menu-bar-separator", props: {}, children: [] },
        ],
      },
    }),
  );

  assert.match(markup, /Blast/);
  assert.match(markup, /Actions/);
  assert.match(markup, /Open/);
  assert.match(markup, /Right-click: Open alternate/);
  assert.match(markup, /cmd \+ K/);
  assert.match(markup, /<details/);
  assert.match(markup, /<hr/);
  assert.doesNotMatch(markup, /does not yet display/);
});

test("server-renders action styles, structured shortcuts, and auto-focus", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "root",
        type: "list",
        props: { navigationTitle: "Actions" },
        children: [
          {
            id: "item",
            type: "list-item",
            props: { title: "Item" },
            children: [
              {
                id: "action",
                type: "action",
                props: {
                  title: "Delete",
                  onAction: "delete-item",
                  shortcut: { modifiers: ["cmd", "shift"], key: "D" },
                  style: "destructive",
                  autoFocus: true,
                },
                children: [],
              },
            ],
          },
        ],
      },
    }),
  );

  assert.match(markup, /data-action-style="destructive"/);
  assert.match(markup, /bg-red-400\/20/);
  assert.match(markup, /Delete/);
  assert.match(markup, /cmd \+ shift \+ D/);
  assert.match(markup, /autofocus/);
});

test("server-renders List and Grid collection accessories defensively", () => {
  const listMarkup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "list-root",
        type: "list",
        props: { navigationTitle: "Accessories" },
        children: [
          {
            id: "list-item",
            type: "list-item",
            props: {
              title: "Ready item",
              accessoryIcon: "star-16",
              accessoryTitle: "Favorite",
              accessories: JSON.stringify([
                { text: "Ready", icon: "checkmark-16", tooltip: "Status", textColor: "raycast-green" },
                { date: "2026-08-31T00:00:00.000Z", tag: "New", tagColor: "#abcdef" },
              ]),
            },
            children: [],
          },
        ],
      },
    }),
  );
  assert.match(listMarkup, /Favorite/);
  assert.match(listMarkup, /data-v2-icon-kind="accessory"/);
  assert.match(listMarkup, /data-accessory-kind="text"/);
  assert.match(listMarkup, /data-accessory-kind="date"/);
  assert.match(listMarkup, /data-accessory-kind="tag"/);
  assert.match(listMarkup, /title="Status"/);
  assert.match(listMarkup, /style="color:#4ade80"/);
  assert.match(listMarkup, /style="color:#abcdef"/);

  const gridMarkup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "grid-root",
        type: "grid",
        props: { navigationTitle: "Grid" },
        children: [
          {
            id: "grid-item",
            type: "grid-item",
            props: {
              content: "circle-16",
              title: "Grid item",
              accessoryIcon: "checkmark-16",
              accessoryTooltip: "Done",
            },
            children: [],
          },
        ],
      },
    }),
  );
  assert.match(gridMarkup, /Grid item/);
  assert.match(gridMarkup, /title="Done"/);
  assert.match(gridMarkup, /data-v2-icon-kind="accessory"/);

  const malformedMarkup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "malformed-root",
        type: "list",
        props: {},
        children: [
          {
            id: "malformed-item",
            type: "list-item",
            props: {
              title: "Malformed",
              accessories: "not-json",
            },
            children: [],
          },
        ],
      },
    }),
  );
  assert.match(malformedMarkup, /Malformed/);
  assert.doesNotMatch(malformedMarkup, /data-accessory-kind/);

  const unsafeMarkup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "unsafe-root",
        type: "list",
        props: {},
        children: [
          {
            id: "unsafe-item",
            type: "list-item",
            props: {
              title: "Unsafe color",
              accessories: JSON.stringify([{ text: "Unsafe", textColor: "red; background: url(https://bad.invalid)" }]),
            },
            children: [],
          },
        ],
      },
    }),
  );
  assert.match(unsafeMarkup, /Unsafe/);
  assert.doesNotMatch(unsafeMarkup, /style="color:red/);
});
