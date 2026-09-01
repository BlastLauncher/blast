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
const svgStub = fileURLToPath(new URL("../dist/renderer/components/Icon/images/v2-scene-test.svg", import.meta.url));
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
const { V2Scene, filterV2SceneActionChildren, formatV2DatePickerValue, serializeV2DatePickerValue } =
  await import("../dist/renderer/V2Scene.js");
Reflect.set(NodeModule, "_resolveFilename", originalResolveFilename);
rmSync(markdownStylesheet);
rmSync(svgStub, { force: true });

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

test("server-renders native date-picker modes and normalizes ISO values", () => {
  const source = "2026-08-28T12:30:00.000Z";
  const dateValue = formatV2DatePickerValue(source, "date");
  const dateTimeValue = formatV2DatePickerValue(source, "date_time");
  const min = formatV2DatePickerValue("2026-08-01T00:00:00.000Z", "date");
  const max = formatV2DatePickerValue("2026-09-30T00:00:00.000Z", "date");

  assert.match(dateValue, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dateTimeValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(
    serializeV2DatePickerValue(dateValue, "date"),
    new Date(
      Number(dateValue.slice(0, 4)),
      Number(dateValue.slice(5, 7)) - 1,
      Number(dateValue.slice(8, 10)),
    ).toISOString(),
  );
  assert.equal(serializeV2DatePickerValue("", "date"), null);
  assert.equal(serializeV2DatePickerValue("2026-02-30", "date"), null);
  const preciseSource = "2026-08-28T12:30:45.123Z";
  const preciseValue = formatV2DatePickerValue(preciseSource, "date_time");
  assert.match(preciseValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.equal(serializeV2DatePickerValue(preciseValue, "date_time"), preciseSource);
  assert.equal(formatV2DatePickerValue("2026-02-30T00:00:00.000Z", "date"), "");
  assert.equal(formatV2DatePickerValue("not-a-date", "date_time"), "");

  const markup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "date-form",
        type: "form",
        props: { navigationTitle: "Dates" },
        children: [
          {
            id: "due",
            type: "form-date-picker",
            props: {
              id: "due",
              title: "Due date",
              type: "date",
              min: "2026-08-01T00:00:00.000Z",
              max: "2026-09-30T00:00:00.000Z",
              defaultValue: source,
              autoFocus: true,
            },
            children: [],
          },
          {
            id: "meeting",
            type: "form-date-picker",
            props: { id: "meeting", title: "Meeting", type: "date_time", defaultValue: source },
            children: [],
          },
        ],
      },
    }),
  );

  assert.match(markup, new RegExp(`type="date"`));
  assert.match(markup, new RegExp(`value="${dateValue}"`));
  assert.match(markup, new RegExp(`min="${min}"`));
  assert.match(markup, new RegExp(`max="${max}"`));
  assert.match(markup, new RegExp(`type="datetime-local"`));
  assert.match(markup, new RegExp(`value="${dateTimeValue}"`));
  assert.match(markup, /autofocus/);
});

test("presents action-panel submenus and filters nested actions deterministically", () => {
  const action = (id, title) => ({ id, type: "action", props: { title, onAction: `event-${id}` }, children: [] });
  const nested = {
    id: "nested",
    type: "action-group",
    props: { title: "Utilities" },
    children: [action("copy", "Copy value"), action("remove", "Remove value")],
  };
  const children = [action("open", "Open item"), nested, action("save", "Save item")];
  const filtered = filterV2SceneActionChildren(children, "copy");
  assert.deepEqual(
    filtered.map((node) => node.id),
    ["nested"],
  );
  assert.deepEqual(
    filtered[0].children.map((node) => node.id),
    ["copy"],
  );
  assert.deepEqual(
    filterV2SceneActionChildren(children, "item").map((node) => node.id),
    ["open", "save"],
  );

  const markup = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "submenu-root",
        type: "detail",
        props: { markdown: "Actions" },
        children: [
          {
            id: "submenu",
            type: "action-group",
            props: {
              title: "More actions",
              icon: "ellipsis-16",
              shortcut: { modifiers: ["cmd"], key: "k" },
              filtering: true,
              isLoading: true,
              onOpen: "submenu-open",
              onSearchTextChange: "submenu-search",
              autoFocus: true,
              isSubmenu: true,
            },
            children: [action("copy", "Copy value")],
          },
        ],
      },
    }),
  );
  assert.match(markup, /data-action-submenu="true"/);
  assert.match(markup, /data-action-submenu-loading="true"/);
  assert.match(markup, /data-action-submenu-open="false"/);
  assert.match(markup, /More actions search/);
  assert.match(markup, /Filter actions…/);
  assert.match(markup, /Copy value/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /autofocus/);
  assert.match(markup, /cmd \+ k/);
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

test("locally filters List and Grid items by title and keywords", () => {
  const listChildren = [
    {
      id: "section",
      type: "list-section",
      props: { title: "Matches" },
      children: [
        { id: "visible", type: "list-item", props: { title: "Visible", keywords: ["Needle alias"] }, children: [] },
        { id: "hidden", type: "list-item", props: { title: "Hidden", keywords: ["other"] }, children: [] },
      ],
    },
    { id: "root-hidden", type: "list-item", props: { title: "Root hidden" }, children: [] },
  ];
  const locallyFilteredList = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "local-list",
        type: "list",
        props: { searchText: "needle" },
        children: listChildren,
      },
    }),
  );
  assert.match(locallyFilteredList, /Visible/);
  assert.match(locallyFilteredList, /Matches/);
  assert.match(locallyFilteredList, /placeholder="Search…"/);
  assert.doesNotMatch(locallyFilteredList, /Hidden/);
  assert.doesNotMatch(locallyFilteredList, /Root hidden/);

  const customFilteredList = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "custom-list",
        type: "list",
        props: { searchText: "needle", onSearchTextChange: "search" },
        children: listChildren,
      },
    }),
  );
  assert.match(customFilteredList, /Visible/);
  assert.match(customFilteredList, /Hidden/);
  assert.match(customFilteredList, /Root hidden/);

  const explicitlyDisabledList = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "disabled-list",
        type: "list",
        props: { filtering: false, searchText: "needle" },
        children: listChildren,
      },
    }),
  );
  assert.match(explicitlyDisabledList, /Hidden/);
  assert.match(explicitlyDisabledList, /Root hidden/);

  const locallyFilteredGrid = renderToStaticMarkup(
    React.createElement(V2Scene, {
      disabled: false,
      onEvent: async () => {},
      root: {
        id: "local-grid",
        type: "grid",
        props: { searchText: "alias" },
        children: [
          {
            id: "grid-visible",
            type: "grid-item",
            props: { title: "Grid visible", keywords: ["Alias"] },
            children: [],
          },
          { id: "grid-hidden", type: "grid-item", props: { title: "Grid hidden" }, children: [] },
        ],
      },
    }),
  );
  assert.match(locallyFilteredGrid, /Grid visible/);
  assert.doesNotMatch(locallyFilteredGrid, /Grid hidden/);
});
