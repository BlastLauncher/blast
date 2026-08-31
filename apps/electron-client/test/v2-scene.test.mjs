import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
require.extensions[".scss"] = () => {};

const markdownStylesheet = fileURLToPath(new URL("../dist/renderer/components/Detail/markdown.scss", import.meta.url));
mkdirSync(fileURLToPath(new URL("../dist/renderer/components/Detail/", import.meta.url)), { recursive: true });
writeFileSync(markdownStylesheet, "");
const { V2Scene } = await import("../dist/renderer/V2Scene.js");
rmSync(markdownStylesheet);

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
