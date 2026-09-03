import assert from "node:assert/strict";
import test from "node:test";

const { createV2NativeMenuBarModel } = await import("../dist/v2MenuBarModel.js");
const { createV2NativeMenuTemplate, toElectronAccelerator } = await import("../dist/v2MenuBarTemplate.js");

test("filters menu-bar commands and keeps their catalog order", () => {
  const model = createV2NativeMenuBarModel({
    state: "ready",
    commands: [
      { extensionId: "view", commandName: "index", title: "View", entryPointMode: "view" },
      { extensionId: "second", commandName: "menu", title: "Second", entryPointMode: "menu-bar" },
      {
        extensionId: "first",
        commandName: "menu",
        title: "First",
        entryPointMode: "menu-bar",
        extensionName: "First Ext",
      },
    ],
  });

  assert.deepEqual(
    model.nodes.map((node) => node.label),
    ["Second", "First"],
  );
  assert.deepEqual(model.nodes[0].action, {
    type: "run-command",
    identity: { extensionId: "second", commandName: "menu" },
  });
  assert.equal(model.nodes[0].enabled, true);
  assert.equal(model.nodes[1].tooltip, "First Ext");
  assert.equal(model.stopEnabled, false);
});

test("projects native menu nodes and dispatches primary, alternate, and stop actions", () => {
  const identity = { extensionId: "menu-extension", commandName: "menu" };
  const model = createV2NativeMenuBarModel({
    state: "running",
    commands: [{ ...identity, title: "Blast Menu", entryPointMode: "menu-bar", extensionName: "Blast" }],
    activeCommand: identity,
    scene: {
      id: "root",
      type: "menu-bar-extra",
      props: { title: "Blast", tooltip: "Blast controls", isLoading: false },
      children: [
        {
          id: "actions",
          type: "menu-bar-section",
          props: { title: "Actions" },
          children: [
            {
              id: "open",
              type: "menu-bar-item",
              props: {
                title: "Open",
                subtitle: "Primary",
                tooltip: "Open Blast",
                shortcut: { modifiers: ["cmd", "shift"], key: "K" },
                onAction: "event-open",
              },
              children: [
                {
                  id: "alternate",
                  type: "menu-bar-item",
                  props: { title: "Open alternate", isAlternate: true, onAction: "event-open-alternate" },
                  children: [],
                },
              ],
            },
            {
              id: "more",
              type: "menu-bar-submenu",
              props: { title: "More", tooltip: "More actions" },
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
  });

  assert.equal(model.title, "Blast");
  assert.equal(model.tooltip, "Blast controls");
  assert.deepEqual(model.activeCommand, identity);
  assert.equal(model.stopEnabled, true);
  const section = model.nodes[0];
  assert.equal(section.type, "section");
  const item = section.children[0];
  assert.equal(item.type, "item");
  assert.deepEqual(item.action, {
    type: "scene-event",
    eventId: "event-open",
    values: { type: "left-click" },
  });
  assert.deepEqual(item.alternate?.action, {
    type: "scene-event",
    eventId: "event-open-alternate",
    values: { type: "right-click" },
  });

  const calls = [];
  const template = createV2NativeMenuTemplate(model, {
    runCommand: (nextIdentity) => calls.push(["run", nextIdentity]),
    sceneEvent: (eventId, values) => calls.push(["event", eventId, values]),
    stopCommand: () => calls.push(["stop"]),
  });
  assert.equal(template[0].type, "submenu");
  assert.equal(template[0].label, "Actions");
  assert.equal(template[0].submenu[0].label, "Open");
  assert.equal(template[0].submenu[0].submenu[0].accelerator, "CommandOrControl+Shift+K");
  template[0].submenu[0].submenu[0].click();
  template[0].submenu[0].submenu[2].click();
  assert.equal(template.at(-1).label, "Stop Blast Menu");
  template.at(-1).click();
  assert.deepEqual(calls, [
    ["event", "event-open", { type: "left-click" }],
    ["event", "event-open-alternate", { type: "right-click" }],
    ["stop"],
  ]);
});

test("omits accelerators that Electron cannot represent safely", () => {
  assert.equal(toElectronAccelerator({ modifiers: ["cmd"], key: "arrowDown" }), "CommandOrControl+Down");
  assert.equal(toElectronAccelerator({ modifiers: ["cmd"], key: "not-a-key" }), undefined);
  assert.equal(toElectronAccelerator({ modifiers: ["unknown"], key: "K" }), undefined);
});
