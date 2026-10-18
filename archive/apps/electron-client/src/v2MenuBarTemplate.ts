import type { MenuItemConstructorOptions } from "electron";

import type { CommandIdentity } from "@blastlauncher/core";
import type { SceneFormValues } from "@blastlauncher/scene";

import type {
  V2NativeMenuAction,
  V2NativeMenuAlternate,
  V2NativeMenuBarModel,
  V2NativeMenuItem,
  V2NativeMenuNode,
  V2NativeMenuSection,
  V2NativeMenuSubmenu,
} from "./v2MenuBarModel";

export interface V2NativeMenuCallbacks {
  readonly runCommand: (identity: CommandIdentity) => void;
  readonly sceneEvent: (eventId: string, values: SceneFormValues) => void;
  readonly stopCommand: () => void;
}

/** Converts the pure V2 menu model into Electron menu template options. */
export function createV2NativeMenuTemplate(
  model: V2NativeMenuBarModel,
  callbacks: V2NativeMenuCallbacks,
): MenuItemConstructorOptions[] {
  const template = model.nodes.flatMap((node) => createNodeTemplate(node, callbacks));
  if (model.activeCommand !== undefined) {
    if (template.length > 0) {
      template.push({ type: "separator" });
    }
    template.push({
      label: "Stop " + (model.activeCommandLabel ?? model.activeCommand.commandName),
      enabled: model.stopEnabled,
      click: callbacks.stopCommand,
    });
  }
  return template;
}

export function toElectronAccelerator(
  shortcut: Readonly<{ readonly modifiers: readonly string[]; readonly key: string }>,
): string | undefined {
  const modifiers = shortcut.modifiers.map((modifier) => {
    switch (modifier.toLowerCase()) {
      case "cmd":
        return "CommandOrControl";
      case "ctrl":
        return "Control";
      case "opt":
      case "alt":
        return "Alt";
      case "shift":
        return "Shift";
      case "windows":
        return "Super";
      default:
        return undefined;
    }
  });
  if (modifiers.some((modifier) => modifier === undefined)) {
    return undefined;
  }

  const key = toElectronKey(shortcut.key);
  return key === undefined ? undefined : [...(modifiers as string[]), key].join("+");
}

function createNodeTemplate(node: V2NativeMenuNode, callbacks: V2NativeMenuCallbacks): MenuItemConstructorOptions[] {
  switch (node.type) {
    case "item":
      return [createItemTemplate(node, callbacks)];
    case "section":
      return [createSectionTemplate(node, callbacks)];
    case "submenu":
      return [createSubmenuTemplate(node, callbacks)];
    case "separator":
      return [{ type: "separator" }];
    default:
      return [];
  }
}

function createItemTemplate(node: V2NativeMenuItem, callbacks: V2NativeMenuCallbacks): MenuItemConstructorOptions {
  const alternate = node.alternate;
  if (alternate === undefined) {
    return createLeafTemplate(node, node.action, callbacks);
  }

  return {
    label: node.label,
    ...(node.subtitle === undefined ? {} : { sublabel: node.subtitle }),
    ...(node.tooltip === undefined ? {} : { toolTip: node.tooltip }),
    enabled: node.enabled || alternate.enabled,
    submenu: [
      createLeafTemplate(node, node.action, callbacks),
      { type: "separator" },
      createLeafTemplate(alternate, alternate.action, callbacks),
    ],
  };
}

function createLeafTemplate(
  node: V2NativeMenuItem | V2NativeMenuAlternate,
  action: V2NativeMenuAction | undefined,
  callbacks: V2NativeMenuCallbacks,
): MenuItemConstructorOptions {
  const accelerator = node.shortcut === undefined ? undefined : toElectronAccelerator(node.shortcut);
  return {
    label: node.label,
    ...(node.subtitle === undefined ? {} : { sublabel: node.subtitle }),
    ...(node.tooltip === undefined ? {} : { toolTip: node.tooltip }),
    ...(accelerator === undefined ? {} : { accelerator }),
    enabled: node.enabled,
    ...(action === undefined ? {} : { click: () => dispatch(action, callbacks) }),
  };
}

function createSectionTemplate(
  node: V2NativeMenuSection,
  callbacks: V2NativeMenuCallbacks,
): MenuItemConstructorOptions {
  const submenu = node.children.flatMap((child) => createNodeTemplate(child, callbacks));
  return {
    type: "submenu",
    label: node.title,
    enabled: submenu.length > 0,
    submenu,
  };
}

function createSubmenuTemplate(
  node: V2NativeMenuSubmenu,
  callbacks: V2NativeMenuCallbacks,
): MenuItemConstructorOptions {
  const submenu = node.children.flatMap((child) => createNodeTemplate(child, callbacks));
  return {
    type: "submenu",
    label: node.title,
    ...(node.tooltip === undefined ? {} : { toolTip: node.tooltip }),
    enabled: submenu.length > 0,
    submenu,
  };
}

function dispatch(action: V2NativeMenuAction, callbacks: V2NativeMenuCallbacks): void {
  switch (action.type) {
    case "run-command":
      callbacks.runCommand(action.identity);
      return;
    case "scene-event":
      callbacks.sceneEvent(action.eventId, action.values);
      return;
    default:
      return;
  }
}

function toElectronKey(key: string): string | undefined {
  const namedKeys: Readonly<Record<string, string>> = {
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
    arrowup: "Up",
    backspace: "Backspace",
    delete: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Escape",
    home: "Home",
    insert: "Insert",
    pagedown: "PageDown",
    pageup: "PageUp",
    return: "Return",
    space: "Space",
    tab: "Tab",
  };
  const normalized = key.toLowerCase();
  if (normalized === "+") {
    return "Plus";
  }
  if (Object.prototype.hasOwnProperty.call(namedKeys, normalized)) {
    return namedKeys[normalized]!;
  }
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return key.toUpperCase();
  }
  const code = key.length === 1 ? key.charCodeAt(0) : -1;
  return code >= 33 && code <= 126 ? key.toUpperCase() : undefined;
}
