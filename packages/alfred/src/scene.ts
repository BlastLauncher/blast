// Draws Alfred UI as ordinary Blast scene trees (decision 0021): the runtime
// keeps view models, this module turns them into `SceneNode`s with stable ids
// plus the handler registry that `event` messages dispatch into, and diffs
// successive trees into `scene.patch` ops. Node shapes follow what
// `@blastlauncher/client-core` reads, so every embedder draws them unchanged.

import { isAbsolute, join } from "node:path";
import type { HandlerRef, JsonValue, SceneNode, ScenePatchOp } from "@blastlauncher/protocol";
import type { GraphArg } from "./graph.ts";
import type { ScriptFilterIcon, ScriptFilterItem } from "./script-filter.ts";
import { decodeModifierMask, type AlfredConnection, type ModifierName } from "./workflow.ts";

export type Handler = (args: JsonValue[]) => void;
/** Handlers by node id, then by `$handler` name. */
export type HandlerRegistry = Map<string, Record<string, Handler>>;

export type Shortcut = { modifiers: string[]; key: string };

export type ActionModel = {
  key: string;
  title: string;
  shortcut?: Shortcut;
  run: () => void;
};

export type ItemModel = {
  key: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon?: JsonValue;
  /** Grid cells only. */
  content?: JsonValue;
  actions: ActionModel[];
};

export type EmptyModel = { title: string; description?: string };

type SearchableView = {
  navigationTitle?: string;
  searchBarPlaceholder?: string;
  isLoading: boolean;
  filtering: boolean;
  /** Echoed back so the search bar is controlled (autocomplete can set it). */
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  items: ItemModel[];
  empty?: EmptyModel;
};

export type ViewModel =
  | ({ kind: "list" } & SearchableView)
  | ({ kind: "grid"; columns: number } & SearchableView)
  | {
      kind: "detail";
      navigationTitle?: string;
      markdown: string;
      isLoading: boolean;
      actions: ActionModel[];
    };

export type ToastModel = {
  id: number;
  style: "success" | "failure";
  title: string;
  message?: string;
};
export type AlertButton = { title: string; run: () => void };
export type AlertModel = {
  id: number;
  title: string;
  message?: string;
  primary: AlertButton;
  dismiss: AlertButton;
};

export type SceneModel = {
  entries: { key: string; view: ViewModel }[];
  /** Back from the active entry; offered only when there is somewhere to go. */
  pop?: () => void;
  closeMainWindow: boolean;
  toast?: ToastModel;
  hud?: { id: number; title: string };
  alert?: AlertModel;
};

type Props = Record<string, JsonValue | HandlerRef>;

/** Drops `undefined` so props stay JSON values on both sides of a diff. */
function clean(props: Record<string, JsonValue | HandlerRef | undefined>): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) if (value !== undefined) out[key] = value;
  return out;
}

// Keys come from script output; encoding keeps them from forging another
// node's id through the `/` separators.
const part = (key: string): string => encodeURIComponent(key);

const node = (id: string, type: string, props: Props, children: SceneNode[] = []): SceneNode => ({
  id,
  type,
  props,
  children,
});

export function renderScene(model: SceneModel): { root: SceneNode; handlers: HandlerRegistry } {
  const handlers: HandlerRegistry = new Map();
  const on = (id: string, name: string, fn: Handler): HandlerRef => {
    const own = handlers.get(id) ?? {};
    own[name] = fn;
    handlers.set(id, own);
    return { $handler: name };
  };
  const actionPanel = (owner: string, actions: ActionModel[]): SceneNode =>
    node(`${owner}/actions`, "Slot", { name: "actions" }, [
      node(
        `${owner}/panel`,
        "ActionPanel",
        {},
        actions.map((action) => {
          const id = `${owner}/a/${part(action.key)}`;
          return node(
            id,
            "Action",
            clean({
              title: action.title,
              shortcut: action.shortcut,
              onAction: on(id, "onAction", () => action.run()),
            }),
          );
        }),
      ),
    ]);

  const item = (base: string, type: string, entry: ItemModel): SceneNode => {
    const id = `${base}/i/${part(entry.key)}`;
    return node(
      id,
      type,
      clean({
        id: entry.key,
        title: entry.title,
        subtitle: entry.subtitle,
        keywords: entry.keywords,
        icon: entry.icon,
        content: entry.content,
      }),
      entry.actions.length > 0 ? [actionPanel(id, entry.actions)] : [],
    );
  };

  const view = (key: string, shown: ViewModel): SceneNode => {
    if (shown.kind === "detail") {
      const id = `${key}/detail`;
      return node(
        id,
        "Detail",
        clean({
          navigationTitle: shown.navigationTitle,
          markdown: shown.markdown,
          isLoading: shown.isLoading,
        }),
        shown.actions.length > 0 ? [actionPanel(id, shown.actions)] : [],
      );
    }
    const grid = shown.kind === "grid";
    const id = `${key}/${shown.kind}`;
    const search = shown.onSearchTextChange;
    const children = shown.items.map((entry) => item(id, grid ? "Grid.Item" : "List.Item", entry));
    if (shown.empty && !shown.isLoading && shown.items.length === 0) {
      children.push(
        node(
          `${id}/empty`,
          grid ? "Grid.EmptyView" : "List.EmptyView",
          clean({ title: shown.empty.title, description: shown.empty.description }),
        ),
      );
    }
    return node(
      id,
      grid ? "Grid" : "List",
      clean({
        navigationTitle: shown.navigationTitle,
        searchBarPlaceholder: shown.searchBarPlaceholder,
        isLoading: shown.isLoading,
        filtering: shown.filtering,
        columns: grid ? shown.columns : undefined,
        searchText: shown.searchText,
        throttle: search ? true : undefined,
        onSearchTextChange: search
          ? on(id, "onSearchTextChange", (args) =>
              search(typeof args[0] === "string" ? args[0] : ""),
            )
          : undefined,
      }),
      children,
    );
  };

  const children: SceneNode[] = model.entries.map((entry, index) =>
    node(entry.key, "Navigation.Entry", { active: index === model.entries.length - 1 }, [
      view(entry.key, entry.view),
    ]),
  );
  if (model.toast) {
    const { toast } = model;
    children.push(
      node(
        `toast/${toast.id}`,
        "Toast",
        clean({ title: toast.title, message: toast.message, style: toast.style }),
      ),
    );
  }
  if (model.hud) children.push(node(`hud/${model.hud.id}`, "HUD", { title: model.hud.title }));
  if (model.alert) {
    const { alert } = model;
    const id = `alert/${alert.id}`;
    const button = (name: string, style: string, value: AlertButton): SceneNode =>
      node(`${id}/${name}`, "Alert.Action", {
        name,
        title: value.title,
        style,
        onAction: on(`${id}/${name}`, "onAction", () => value.run()),
      });
    children.push(
      node(id, "Alert", clean({ title: alert.title, message: alert.message }), [
        button("primaryAction", "default", alert.primary),
        button("dismissAction", "cancel", alert.dismiss),
      ]),
    );
  }
  const pop = model.pop;
  const root = node(
    "nav",
    "Navigation",
    clean({
      depth: model.entries.length,
      pop: pop ? on("nav", "pop", () => pop()) : undefined,
      closeMainWindow: model.closeMainWindow ? true : undefined,
    }),
    children,
  );
  return { root, handlers };
}

// ---------------------------------------------------------------------------
// Alfred items → actions

const MODIFIER_BITS: Record<ModifierName, number> = {
  cmd: 1 << 20,
  alt: 1 << 19,
  ctrl: 1 << 18,
  shift: 1 << 17,
  fn: 1 << 23,
};
// Raycast shortcuts have no `fn`; such actions stay reachable from the panel.
const SHORTCUT_NAMES: Partial<Record<ModifierName, string>> = {
  cmd: "cmd",
  alt: "opt",
  ctrl: "ctrl",
  shift: "shift",
};

/** The `NSEventModifierFlags` mask of a canonical `cmd+shift` combination. */
export function modifierMask(key: string): number {
  let mask = 0;
  for (const name of key.split("+")) mask += MODIFIER_BITS[name as ModifierName] ?? 0;
  return mask;
}

export type ItemCallbacks = {
  run(arg: GraphArg, variables: Record<string, string>, modifiers: number): void;
  autocomplete(text: string): void;
  copy(text: string): void;
  largeType(text: string): void;
  quickLook(url: string): void;
};

export type ItemContext = {
  /** Enabled connections leaving the object that produced the item. */
  connections: AlfredConnection[];
  /** Session and Script Filter output variables; item variables win. */
  variables: Record<string, string>;
  callbacks: ItemCallbacks;
};

/**
 * What Alfred lets you do with a result: ↩ runs the graph (or autocompletes an
 * invalid item), modifier combinations from `mods` and from the object's
 * modifier connections run it with that mask, and ⌘C / ⌘L / ⇥ / ⌘Y are the
 * standard copy, Large Type, autocomplete and Quick Look.
 */
export function itemActions(item: ScriptFilterItem, context: ItemContext): ActionModel[] {
  const { callbacks } = context;
  const actions: ActionModel[] = [];
  const arg = item.arg ?? "";
  const itemVariables = { ...context.variables, ...item.variables };
  const autocomplete = item.autocomplete;
  if (item.valid) {
    actions.push({
      key: "primary",
      title: "Open",
      run: () => callbacks.run(arg, itemVariables, 0),
    });
  } else if (autocomplete !== undefined) {
    actions.push({
      key: "primary",
      title: "Autocomplete",
      run: () => callbacks.autocomplete(autocomplete),
    });
  }

  const keys = new Set(Object.keys(item.mods ?? {}));
  const subtext = new Map<string, string>();
  for (const connection of context.connections) {
    if (connection.modifiers <= 0) continue;
    const key = decodeModifierMask(connection.modifiers).join("+");
    if (!key) continue;
    keys.add(key);
    if (connection.modifierSubtext && !subtext.has(key)) {
      subtext.set(key, connection.modifierSubtext);
    }
  }
  for (const key of keys) {
    const mod = item.mods?.[key];
    if (!(mod?.valid ?? item.valid)) continue;
    const modArg = mod?.arg ?? arg;
    const variables = { ...context.variables, ...(mod?.variables ?? item.variables) };
    const names = key.split("+").flatMap((name) => SHORTCUT_NAMES[name as ModifierName] ?? []);
    actions.push({
      key: `mod:${key}`,
      title: mod?.subtitle || subtext.get(key) || `Run with ${key}`,
      ...(names.length > 0 ? { shortcut: { modifiers: names, key: "return" } } : {}),
      run: () => callbacks.run(modArg, variables, modifierMask(key)),
    });
  }

  if (autocomplete !== undefined && item.valid) {
    actions.push({
      key: "autocomplete",
      title: "Autocomplete",
      shortcut: { modifiers: [], key: "tab" },
      run: () => callbacks.autocomplete(autocomplete),
    });
  }
  const copy = item.text?.copy ?? (typeof item.arg === "string" ? item.arg : undefined);
  if (copy !== undefined) {
    actions.push({
      key: "copy",
      title: "Copy",
      shortcut: { modifiers: ["cmd"], key: "c" },
      run: () => callbacks.copy(copy),
    });
  }
  const large = item.text?.largetext ?? item.title;
  actions.push({
    key: "largetype",
    title: "Show Large Type",
    shortcut: { modifiers: ["cmd"], key: "l" },
    run: () => callbacks.largeType(large),
  });
  const quicklook = item.quicklookurl;
  if (quicklook) {
    actions.push({
      key: "quicklook",
      title: "Quick Look",
      shortcut: { modifiers: ["cmd"], key: "y" },
      run: () => callbacks.quickLook(quicklook),
    });
  }
  return actions;
}

/**
 * Raycast icon for a result: `fileicon` shows the file's own icon, a plain
 * path is an image relative to the workflow; without one, the object's
 * `<uid>.png` or the workflow `icon.png` (resolved by the caller).
 */
export function itemIcon(
  icon: ScriptFilterIcon | undefined,
  workflowDir: string | undefined,
  fallback: string | undefined,
): JsonValue | undefined {
  if (!icon || icon.type === "filetype") return fallback;
  const path =
    isAbsolute(icon.path) || icon.path.startsWith("~") || !workflowDir
      ? icon.path
      : join(workflowDir, icon.path);
  return icon.type === "fileicon" ? { fileIcon: path } : path;
}

/** Unique, stable item keys: the `uid` when it is unused, else the position. */
export function itemKeys(items: { uid?: string }[]): string[] {
  const used = new Set<string>();
  return items.map((item, index) => {
    const key = item.uid !== undefined && !used.has(item.uid) ? item.uid : `#${index}`;
    used.add(key);
    return key;
  });
}

// ---------------------------------------------------------------------------
// Diffing

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!Object.hasOwn(b, key)) return false;
    if (!jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

function diffNode(prev: SceneNode, next: SceneNode, ops: ScenePatchOp[]): void {
  if (prev.type !== next.type) {
    ops.push({ op: "replace", id: next.id, node: next });
    return;
  }
  if (!jsonEqual(prev.props, next.props)) ops.push({ op: "props", id: next.id, props: next.props });
  const before = new Map(prev.children.map((child) => [child.id, child]));
  const sameOrder =
    prev.children.length === next.children.length &&
    next.children.every((child, index) => prev.children[index]!.id === child.id);
  if (!sameOrder) {
    ops.push({
      op: "children",
      id: next.id,
      children: next.children.map((child) => (before.has(child.id) ? child.id : child)),
    });
  }
  for (const child of next.children) {
    const old = before.get(child.id);
    if (old) diffNode(old, child, ops);
  }
}

/**
 * Patch ops turning `prev` into `next`, matching nodes by id among siblings.
 * `undefined` means the root itself changed and a full `scene` must be sent.
 */
export function diffScene(
  prev: SceneNode | null,
  next: SceneNode | null,
): ScenePatchOp[] | undefined {
  if (!prev || !next || prev.id !== next.id || prev.type !== next.type) return undefined;
  const ops: ScenePatchOp[] = [];
  diffNode(prev, next, ops);
  return ops;
}
