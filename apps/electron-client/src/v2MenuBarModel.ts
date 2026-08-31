import type { CoreClientSnapshot } from "@blastlauncher/client";
import type { CommandIdentity } from "@blastlauncher/core";
import type { SceneFormValues, SceneNode, SceneShortcut } from "@blastlauncher/scene";

export type V2NativeMenuAction =
  | { readonly type: "run-command"; readonly identity: CommandIdentity }
  | { readonly type: "scene-event"; readonly eventId: string; readonly values: SceneFormValues };

export interface V2NativeMenuAlternate {
  readonly label: string;
  readonly subtitle?: string;
  readonly tooltip?: string;
  readonly shortcut?: SceneShortcut;
  readonly enabled: boolean;
  readonly action?: V2NativeMenuAction;
}

export interface V2NativeMenuItem {
  readonly type: "item";
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly tooltip?: string;
  readonly shortcut?: SceneShortcut;
  readonly enabled: boolean;
  readonly action?: V2NativeMenuAction;
  readonly alternate?: V2NativeMenuAlternate;
}

export interface V2NativeMenuSection {
  readonly type: "section";
  readonly id: string;
  readonly title: string;
  readonly children: readonly V2NativeMenuNode[];
}

export interface V2NativeMenuSubmenu {
  readonly type: "submenu";
  readonly id: string;
  readonly title: string;
  readonly tooltip?: string;
  readonly children: readonly V2NativeMenuNode[];
}

export interface V2NativeMenuSeparator {
  readonly type: "separator";
  readonly id: string;
}

export type V2NativeMenuNode = V2NativeMenuItem | V2NativeMenuSection | V2NativeMenuSubmenu | V2NativeMenuSeparator;

export interface V2NativeMenuBarModel {
  readonly title?: string;
  readonly tooltip?: string;
  readonly nodes: readonly V2NativeMenuNode[];
  readonly activeCommand?: CommandIdentity;
  readonly activeCommandLabel?: string;
  readonly stopEnabled: boolean;
}

/**
 * Projects a path-free client snapshot into the data required by a native
 * status-item menu. The returned model has no Electron or callback values.
 */
export function createV2NativeMenuBarModel(snapshot: CoreClientSnapshot): V2NativeMenuBarModel {
  const menuBarCommands = snapshot.commands.filter((command) => command.entryPointMode === "menu-bar");
  const activeCommand = snapshot.activeCommand;
  const activeDescriptor =
    activeCommand === undefined
      ? undefined
      : menuBarCommands.find(
          (command) =>
            command.extensionId === activeCommand.extensionId && command.commandName === activeCommand.commandName,
        );

  if (activeCommand !== undefined && activeDescriptor !== undefined) {
    const root = snapshot.scene?.type === "menu-bar-extra" ? snapshot.scene : undefined;
    const enabled = snapshot.state === "running" && booleanProp(root, "isLoading") !== true;
    const nodes =
      root === undefined ? createLoadingItem(activeDescriptor, snapshot.state) : createNodes(root.children, enabled);
    return {
      ...(stringProp(root, "title") === undefined ? {} : { title: stringProp(root, "title") }),
      ...(stringProp(root, "tooltip") === undefined ? {} : { tooltip: stringProp(root, "tooltip") }),
      nodes,
      activeCommand: { ...activeCommand },
      activeCommandLabel: commandLabel(activeDescriptor),
      stopEnabled: snapshot.state !== "stopping" && snapshot.state !== "closing" && snapshot.state !== "closed",
    };
  }

  const canLaunch = activeCommand === undefined && snapshot.state === "ready";
  return {
    nodes: menuBarCommands.map((command) => ({
      type: "item",
      id: "command:" + command.extensionId + ":" + command.commandName,
      label: commandLabel(command),
      ...(command.extensionName === undefined ? {} : { tooltip: command.extensionName }),
      enabled: canLaunch,
      action: {
        type: "run-command",
        identity: { extensionId: command.extensionId, commandName: command.commandName },
      },
    })),
    stopEnabled: false,
  };
}

function createNodes(nodes: readonly SceneNode[], enabled: boolean): readonly V2NativeMenuNode[] {
  const result: V2NativeMenuNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "menu-bar-item":
        result.push(createItem(node, enabled));
        break;
      case "menu-bar-section": {
        const children = createNodes(node.children, enabled);
        const title = stringProp(node, "title");
        if (title === undefined) {
          result.push(...children);
        } else {
          result.push({ type: "section", id: node.id, title, children });
        }
        break;
      }
      case "menu-bar-submenu":
        result.push({
          type: "submenu",
          id: node.id,
          title: stringProp(node, "title") ?? "More",
          ...(stringProp(node, "tooltip") === undefined ? {} : { tooltip: stringProp(node, "tooltip") }),
          children: createNodes(node.children, enabled),
        });
        break;
      case "menu-bar-separator":
        result.push({ type: "separator", id: node.id });
        break;
      default:
        break;
    }
  }
  return result;
}

function createItem(node: SceneNode, enabled: boolean): V2NativeMenuItem {
  const eventId = stringProp(node, "onAction");
  const alternateNode = node.children.find(
    (child) => child.type === "menu-bar-item" && booleanProp(child, "isAlternate") === true,
  );
  const alternateEventId = alternateNode === undefined ? undefined : stringProp(alternateNode, "onAction");
  const alternate =
    alternateNode === undefined
      ? undefined
      : ({
          label: stringProp(alternateNode, "title") ?? "Alternate action",
          ...(stringProp(alternateNode, "subtitle") === undefined
            ? {}
            : { subtitle: stringProp(alternateNode, "subtitle") }),
          ...(stringProp(alternateNode, "tooltip") === undefined
            ? {}
            : { tooltip: stringProp(alternateNode, "tooltip") }),
          ...(shortcutProp(alternateNode, "shortcut") === undefined
            ? {}
            : { shortcut: shortcutProp(alternateNode, "shortcut") }),
          enabled: enabled && alternateEventId !== undefined,
          ...(alternateEventId === undefined
            ? {}
            : {
                action: {
                  type: "scene-event" as const,
                  eventId: alternateEventId,
                  values: { type: "right-click" },
                },
              }),
        } satisfies V2NativeMenuAlternate);

  return {
    type: "item",
    id: node.id,
    label: stringProp(node, "title") ?? node.id,
    ...(stringProp(node, "subtitle") === undefined ? {} : { subtitle: stringProp(node, "subtitle") }),
    ...(stringProp(node, "tooltip") === undefined ? {} : { tooltip: stringProp(node, "tooltip") }),
    ...(shortcutProp(node, "shortcut") === undefined ? {} : { shortcut: shortcutProp(node, "shortcut") }),
    enabled: enabled && eventId !== undefined,
    ...(eventId === undefined
      ? {}
      : {
          action: {
            type: "scene-event" as const,
            eventId,
            values: { type: "left-click" },
          },
        }),
    ...(alternate === undefined ? {} : { alternate }),
  };
}

function createLoadingItem(
  command: { readonly extensionId: string; readonly commandName: string; readonly title?: string },
  state: CoreClientSnapshot["state"],
): V2NativeMenuItem[] {
  return [
    {
      type: "item",
      id: "active:" + command.extensionId + ":" + command.commandName,
      label: commandLabel(command),
      subtitle: state === "starting" ? "Starting…" : "Loading…",
      enabled: false,
    },
  ];
}

function commandLabel(command: { readonly commandName: string; readonly title?: string }): string {
  return command.title ?? command.commandName;
}

function stringProp(node: SceneNode | undefined, key: string): string | undefined {
  const value = node?.props[key];
  return typeof value === "string" ? value : undefined;
}

function booleanProp(node: SceneNode | undefined, key: string): boolean | undefined {
  const value = node?.props[key];
  return typeof value === "boolean" ? value : undefined;
}

function shortcutProp(node: SceneNode, key: string): SceneShortcut | undefined {
  const value = node.props[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const shortcut = value as { readonly modifiers?: unknown; readonly key?: unknown };
  if (
    !Array.isArray(shortcut.modifiers) ||
    !shortcut.modifiers.every((modifier) => typeof modifier === "string") ||
    typeof shortcut.key !== "string" ||
    shortcut.key.length === 0
  ) {
    return undefined;
  }
  return { modifiers: [...shortcut.modifiers], key: shortcut.key };
}
