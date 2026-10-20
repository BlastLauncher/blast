import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { event, handler, selectionId, text, type OutboundEvent } from "./nodes.ts";
import { activeNode, actionRows, panelRows, sceneToView } from "./view.ts";
import { contentGlyph, gridMove } from "./grid.ts";
import { dropdownLabel, dropdownOptions, visibleOptions } from "./dropdown.ts";
import { createFormController, type FormInput, type FormFieldView } from "./form-view.ts";
export type { FormFieldView } from "./form-view.ts";
import { loadMoreRequest } from "./pagination.ts";
import { searchDispatch } from "./search.ts";
import { feedbackState } from "./feedback.ts";
import { HUD_DURATION_MS } from "./hud.ts";
import { menuBarStep, menuBarView, type MenuBarAction } from "./menu-bar.ts";
import { matchesShortcut, shortcutLabel, type KeyInput, type Platform } from "./shortcut.ts";

// The whole Raycast client as one state machine. An embedder feeds it scenes
// and semantic inputs, draws `view()`, sends the returned events to the
// session and executes the returned effects. No timers, no I/O: delays come
// back as `schedule` effects and return through `tick(token)`.

export type ControllerInput =
  | FormInput
  | { type: "search"; text: string }
  | { type: "move"; direction: "up" | "down" | "left" | "right" }
  /** Pointer selection of a list item or grid cell by its view id. */
  | { type: "select"; id: string }
  | { type: "primary" }
  | { type: "openActions" }
  | { type: "closeActions" }
  | { type: "actionsQuery"; text: string }
  | { type: "key"; key: KeyInput }
  | { type: "back" }
  | { type: "openDropdown" }
  | { type: "dropdownQuery"; text: string }
  | { type: "chooseDropdown" }
  | { type: "toastAction"; index: number }
  | { type: "alert"; confirm: boolean; remember?: boolean };

export type Effect = { type: "quit" } | { type: "schedule"; ms: number; token: string };
export type ControllerResult = {
  events: OutboundEvent[];
  effects: Effect[];
  /** A `key` input matched a shortcut, so the embedder should not also treat the press as text. */
  handled?: true;
};

export type ViewKind = "list" | "grid" | "detail" | "form" | "menu-bar" | "empty";
export type RowView = {
  /** The selection id for items, the node id for section headers. */
  id: string;
  kind: "item" | "section" | "unsupported";
  title: string;
  subtitle: string;
  accessories: string;
  icon: boolean;
  /** Items in a section header's section. */
  count: number | null;
  selected: boolean;
  /** The row as one line, for clients that do not lay columns out. */
  text: string;
};
export type GridCellView = {
  id: string;
  title: string;
  subtitle: string;
  /** The cell content as short text: image source name or color. */
  content: string;
  selected: boolean;
};
export type GridRowView = { id: string | null; header: string; cells: GridCellView[] };
export type ActionRowView = {
  id: string;
  kind: "action" | "submenu" | "section";
  title: string;
  shortcut: string;
  selected: boolean;
};
export type DropdownOptionView = {
  value: string;
  title: string;
  section: string;
  current: boolean;
  selected: boolean;
};
export type MenuRowView = {
  id: string;
  kind: "item" | "submenu" | "section";
  title: string;
  subtitle: string;
  shortcut: string;
  disabled: boolean;
  selected: boolean;
};

export type ControllerView = {
  kind: ViewKind;
  title: string;
  loading: boolean;
  search: { text: string; placeholder: string };
  rows: RowView[];
  grid: GridRowView[] | null;
  selectedId: string | null;
  emptyText: string;
  detail: string;
  primary: { title: string; shortcut: string; enabled: boolean };
  actions: {
    open: boolean;
    title: string;
    query: string;
    /** Titles of the submenus entered so far. */
    breadcrumb: string[];
    rows: ActionRowView[];
    /** Index among the selectable rows, -1 when there are none. */
    selectedIndex: number;
  };
  dropdown: {
    label: string;
    tooltip: string;
    open: boolean;
    query: string;
    options: DropdownOptionView[];
    selectedIndex: number;
  } | null;
  feedback: {
    toast: {
      style: string;
      title: string;
      message: string;
      actions: { title: string; shortcut: string }[];
    } | null;
    /** Only while the HUD window is open. */
    hud: { title: string } | null;
    alert: {
      title: string;
      message: string;
      rememberUserChoice: boolean;
      remember: boolean;
      primary: { title: string; style: string } | null;
      dismiss: { title: string; style: string } | null;
    } | null;
  };
  menuBar: {
    title: string;
    tooltip: string;
    loading: boolean;
    path: string[];
    rows: MenuRowView[];
    selectedId: string | null;
  } | null;
  form: { fields: FormFieldView[]; focusId: string | null } | null;
  requests: {
    quit: boolean;
    /** The last scene asked the client to clear the search bar. */
    clearSearch: boolean;
  };
};

export type Controller = {
  scene(message: SceneMessage | undefined): ControllerResult;
  input(action: ControllerInput): ControllerResult;
  /** A delay requested by a `schedule` effect has passed. Unknown tokens are ignored. */
  tick(token: string): ControllerResult;
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
};

export type ControllerOptions = {
  platform: Platform;
  /** Overrides how long a HUD stays visible. */
  hudDurationMs?: number;
};

const fresh = (): ControllerResult => ({ events: [], effects: [] });
const send = (out: ControllerResult, value: OutboundEvent | undefined) => {
  if (value) out.events.push(value);
};
const run = (out: ControllerResult, node: SceneNode | undefined) =>
  send(out, event(node, runName(node)));
const clamp = (value: number, length: number) => Math.max(0, Math.min(length - 1, value));
const runName = (node: SceneNode | undefined) =>
  handler(node?.props.onAction) ? "onAction" : "onSubmit";

export function createController(options: ControllerOptions): Controller {
  const { platform } = options;
  let current: SceneMessage | undefined;
  const form = createFormController();
  let searchText = "";
  let selectedId: string | null = null;
  let previousSelection: string | null | undefined;
  // A selection the extension controls (`selectedItemId`) only changes when it
  // echoes the request back, so a request waits here and is reported once.
  let selectionProp: unknown;
  let pendingSelection: string | undefined;
  let menuPath: string[] = [];
  let panel: string[] | null = null;
  let panelQuery = "";
  let panelIndex = 0;
  let dropdownOpen = false;
  let dropdownQuery = "";
  let dropdownIndex = 0;
  let paginatedFor = -1;
  let listId: string | undefined;
  let searchProp: unknown;
  let pendingSearch: string | undefined;
  let clearRequest = "";
  let popRequest = "";
  let hudKey = "";
  let hudVisible = false;
  let hudGeneration = 0;
  let quitRequested = false;
  let clearSearchRequested = false;
  let serial = 0;
  const deferred = new Map<string, { token: string; event: OutboundEvent }>();
  const listeners = new Set<(view: ControllerView) => void>();
  let lastJson = "";

  const quit = (out: ControllerResult) => {
    if (quitRequested) return;
    quitRequested = true;
    out.effects.push({ type: "quit" });
  };
  // Forward `value` now, or after `ms`; a newer forward under the same key
  // replaces a waiting one.
  const forward = (
    out: ControllerResult,
    key: string,
    value: { event: OutboundEvent; delayMs: number } | undefined,
  ) => {
    deferred.delete(key);
    if (!value) return;
    if (!value.delayMs) return send(out, value.event);
    const token = `${key}:${++serial}`;
    deferred.set(key, { token, event: value.event });
    out.effects.push({ type: "schedule", ms: value.delayMs, token });
  };

  const base = () => sceneToView(current, { searchText, selectedId });
  type Base = ReturnType<typeof base>;
  const isMenu = (view: Base) => view.list?.type === "MenuBarExtra";
  const panelNodeOf = (view: Base) => {
    let node = view.actions;
    for (const id of panel ?? [])
      node = panelRows(node, "", platform).find((row) => row.node.id === id)?.node;
    return node;
  };
  const panelState = (view: Base) => {
    const node = panelNodeOf(view);
    const rows = panelRows(node, panelQuery, platform);
    const items = rows.filter((row) => row.item);
    const index = items.length ? clamp(panelIndex, items.length) : -1;
    return { node, rows, items, index, chosen: items[index]?.node };
  };
  const dropdownState = (view: Base) => {
    const choices = visibleOptions(view.accessory, dropdownQuery);
    const index = choices.length ? clamp(dropdownIndex, choices.length) : -1;
    return { options: choices, index, chosen: choices[index] };
  };
  const mode = (view: Base, alert: boolean) =>
    alert
      ? "alert"
      : isMenu(view)
        ? "menu"
        : dropdownOpen
          ? "dropdown"
          : panel !== null
            ? "panel"
            : "base";

  const closeDropdown = () => {
    dropdownOpen = false;
    dropdownQuery = "";
    dropdownIndex = 0;
  };
  const openPanel = (path: string[]) => {
    panel = path;
    panelQuery = "";
    panelIndex = 0;
  };
  const popOrQuit = (out: ControllerResult, view: Base) => {
    if (handler(view.navigation?.props.pop)) send(out, event(view.navigation, "pop"));
    else quit(out);
  };

  function resetForList(list: SceneNode | undefined) {
    listId = list?.id;
    panel = null;
    panelQuery = "";
    panelIndex = 0;
    selectedId = null;
    previousSelection = undefined;
    pendingSelection = undefined;
    menuPath = [];
    closeDropdown();
    paginatedFor = -1;
    searchText = text(list?.props.searchText);
    pendingSearch = undefined;
    deferred.delete("search");
    deferred.delete("dropdown");
  }

  // What follows every change: the selection the view settled on is reported
  // once, and pagination asks for the next page once per item count.
  function reconcile(out: ControllerResult) {
    const view = base();
    form.active(mode(view, !!feedbackState(current).alert) === "base", out.events);
    if (dropdownOpen && !view.accessory) closeDropdown();
    const id = selectionId(view.selected);
    if (pendingSelection !== undefined && id === pendingSelection) pendingSelection = undefined;
    // A menu-bar command has no list selection; its own state drives rows.
    if (id !== null && pendingSelection === undefined) {
      selectedId = id;
      if (previousSelection !== id) {
        previousSelection = id;
        send(out, event(view.list, "onSelectionChange", [id]));
      }
    }
    const load = loadMoreRequest(view.list, view.items, id, paginatedFor);
    if (load) {
      paginatedFor = load.count;
      send(out, load.event);
    }
  }

  function applyScene(out: ControllerResult) {
    const list = activeNode(current?.root);
    const prop = list?.props.searchText;
    if (list?.id !== listId) resetForList(list);
    else if (prop !== searchProp) {
      if (prop === pendingSearch) pendingSearch = undefined;
      if (typeof prop === "string" && pendingSearch === undefined) searchText = prop;
    }
    searchProp = prop;
    const controlled = list?.props.selectedItemId;
    if (controlled !== selectionProp) pendingSelection = undefined;
    selectionProp = controlled;

    const view = base();
    form.scene(
      list?.type === "Form" ? list : undefined,
      out.events,
      mode(view, !!feedbackState(current).alert) === "base",
    );
    clearSearchRequested = false;
    const props = view.navigation?.props;
    if (props) {
      const clear = JSON.stringify(props.clearSearchBar) ?? "";
      const pop = JSON.stringify(props.popToRoot) ?? "";
      const popOptions = props.popToRoot;
      if (
        (clear && clear !== clearRequest) ||
        (pop !== popRequest &&
          popOptions &&
          typeof popOptions === "object" &&
          !Array.isArray(popOptions) &&
          "clearSearchBar" in popOptions &&
          popOptions.clearSearchBar)
      ) {
        searchText = "";
        pendingSearch = undefined;
        deferred.delete("search");
        clearSearchRequested = true;
        send(out, event(view.list, "onSearchTextChange", [""]));
      }
      clearRequest = clear;
      popRequest = pop;
      if (props.closeMainWindow) quit(out);
    }

    const { hud } = feedbackState(current);
    const key = hud ? `${hud.node.id}\u0000${hud.title}` : "";
    if (key !== hudKey) {
      hudKey = key;
      hudVisible = !!hud;
      const generation = ++hudGeneration;
      if (hud)
        out.effects.push({
          type: "schedule",
          ms: options.hudDurationMs ?? hud.durationMs ?? HUD_DURATION_MS,
          token: `hud:${generation}`,
        });
    }
  }

  function move(out: ControllerResult, direction: "up" | "down" | "left" | "right") {
    const view = base();
    const vertical = direction === "up" || direction === "down";
    const delta = direction === "down" || direction === "right" ? 1 : -1;
    switch (mode(view, !!feedbackState(current).alert)) {
      case "alert":
        return;
      case "menu": {
        const action: MenuBarAction = vertical
          ? { type: "move", delta }
          : direction === "left"
            ? { type: "back" }
            : { type: "activate" };
        return menu(out, view, action);
      }
      case "dropdown":
        if (vertical)
          dropdownIndex = clamp(
            dropdownState(view).index + delta,
            dropdownState(view).options.length,
          );
        return;
      case "panel":
        if (vertical)
          panelIndex = clamp(panelState(view).index + delta, panelState(view).items.length);
        return;
    }
    if (view.list?.type === "Form") return;
    if (!vertical && !view.grid) return;
    const id = selectionId(view.selected);
    const index = view.items.findIndex((item) => item.id === view.selected?.id);
    choose(
      out,
      view,
      view.grid
        ? gridMove(view.grid.rows, id, direction)
        : selectionId(view.items[clamp(index + delta, view.items.length)]),
    );
  }

  function choose(out: ControllerResult, view: Base, target: string | null) {
    if (view.list?.props.selectedItemId == null) {
      selectedId = target;
      return;
    }
    if (target === null || target === selectionId(view.selected)) return;
    pendingSelection = target;
    previousSelection = target;
    send(out, event(view.list, "onSelectionChange", [target]));
  }

  function menu(out: ControllerResult, view: Base, action: MenuBarAction) {
    const step = menuBarStep(current, { path: menuPath, selectedId }, action, platform);
    if (step.leave) popOrQuit(out, view);
    menuPath = step.state.path;
    selectedId = step.state.selectedId;
    for (const value of step.events) send(out, value);
  }

  function primary(out: ControllerResult, view: Base) {
    switch (mode(view, !!feedbackState(current).alert)) {
      case "alert":
        return;
      case "menu":
        return menu(out, view, { type: "activate" });
      case "dropdown": {
        const { chosen } = dropdownState(view);
        if (!chosen) return;
        send(out, event(view.accessory, "onChange", [chosen.value]));
        return closeDropdown();
      }
      case "panel": {
        const { chosen } = panelState(view);
        if (chosen?.type === "ActionPanel.Submenu") {
          send(out, event(chosen, "onOpen"));
          return openPanel([...(panel ?? []), chosen.id]);
        }
        run(out, chosen);
        panel = null;
        return;
      }
    }
    run(out, view.primary);
  }

  function back(out: ControllerResult, view: Base) {
    const { alert } = feedbackState(current);
    switch (mode(view, !!alert)) {
      case "alert":
        return run(out, alert?.dismiss?.node);
      case "menu":
        return menu(out, view, { type: "back", escape: true });
      case "dropdown":
        return closeDropdown();
      case "panel": {
        const path = panel ?? [];
        panel = path.length ? path.slice(0, -1) : null;
        panelQuery = "";
        panelIndex = 0;
        return;
      }
    }
    popOrQuit(out, view);
  }

  function shortcutKey(out: ControllerResult, view: Base, press: KeyInput) {
    const feedback = feedbackState(current);
    if (mode(view, !!feedback.alert) !== "base") return;
    const toast = feedback.toast?.actions.find((action) =>
      matchesShortcut(action.shortcut, press, platform),
    );
    if (toast) {
      out.handled = true;
      return run(out, toast.node);
    }
    const shortcut = actionRows(view.actions, "", platform).find(
      (row) => row.item && matchesShortcut(row.node.props.shortcut, press, platform),
    );
    if (!shortcut) return;
    out.handled = true;
    if (shortcut.node.type === "ActionPanel.Submenu") {
      send(out, event(shortcut.node, "onOpen"));
      openPanel([shortcut.node.id]);
    } else run(out, shortcut.node);
  }

  function apply(out: ControllerResult, action: ControllerInput) {
    const view = base();
    const feedback = feedbackState(current);
    const level = mode(view, !!feedback.alert);
    switch (action.type) {
      case "focus":
      case "focusNext":
      case "focusPrev":
      case "setValue":
      case "toggle":
      case "optionMove":
      case "optionChoose":
        if (level === "base" && view.list?.type === "Form") form.input(action, out.events);
        return;
      case "submit":
        if (level === "base" && view.list?.type === "Form") run(out, view.primary);
        return;
      case "search": {
        if (level !== "base" || isMenu(view) || searchText === action.text) return;
        searchText = action.text;
        clearSearchRequested = false;
        const value = searchDispatch(view.list, action.text);
        pendingSearch = value ? action.text : undefined;
        return forward(out, "search", value);
      }
      case "move":
        return move(out, action.direction);
      case "select": {
        if (level !== "base" || isMenu(view)) return;
        if (view.items.some((item) => selectionId(item) === action.id))
          choose(out, view, action.id);
        return;
      }
      case "primary":
        return primary(out, view);
      case "openActions":
        if (level === "base" && view.list?.type !== "MenuBarExtra") openPanel([]);
        return;
      case "closeActions":
        if (level === "panel") panel = null;
        return;
      case "actionsQuery": {
        if (level !== "panel") return;
        panelQuery = action.text;
        panelIndex = 0;
        return send(out, event(panelState(view).node, "onSearchTextChange", [action.text]));
      }
      case "key":
        return shortcutKey(out, view, action.key);
      case "back":
        return back(out, view);
      case "openDropdown":
        if (level === "base" && view.accessory) {
          dropdownOpen = true;
          dropdownQuery = "";
          dropdownIndex = 0;
        }
        return;
      case "dropdownQuery":
        if (level !== "dropdown") return;
        dropdownQuery = action.text;
        dropdownIndex = 0;
        return forward(out, "dropdown", searchDispatch(view.accessory, action.text));
      case "chooseDropdown":
        if (level === "dropdown") primary(out, view);
        return;
      case "toastAction": {
        if (level === "alert") return;
        const toast = feedback.toast?.actions[action.index];
        return toast ? run(out, toast.node) : undefined;
      }
      case "alert": {
        const { alert } = feedback;
        if (!alert) return;
        if (action.remember !== undefined)
          send(out, event(alert.node, "onRememberUserChoiceChange", [action.remember]));
        return run(out, (action.confirm ? alert.primary : alert.dismiss)?.node);
      }
    }
  }

  function settle(out: ControllerResult): ControllerResult {
    reconcile(out);
    const json = JSON.stringify(snapshot());
    if (json !== lastJson) {
      lastJson = json;
      const next = snapshot();
      for (const listener of listeners) listener(next);
    }
    return out;
  }

  function snapshot(): ControllerView {
    const list = base();
    const feedback = feedbackState(current);
    const level = mode(list, !!feedback.alert);
    const kind: ViewKind = !list.list
      ? "empty"
      : list.list.type === "Grid"
        ? "grid"
        : list.list.type === "Detail"
          ? "detail"
          : list.list.type === "Form"
            ? "form"
            : list.list.type === "MenuBarExtra"
              ? "menu-bar"
              : "list";
    const selected = selectionId(list.selected);
    const rowView = (row: (typeof list.rows)[number]): RowView => {
      const item = row.item;
      return {
        id: item ? (selectionId(row.node) ?? row.node.id) : row.node.id,
        kind: item ? "item" : row.text.startsWith("[Unsupported:") ? "unsupported" : "section",
        title: row.title ?? row.text,
        subtitle: row.subtitle ?? "",
        accessories: row.accessories ?? "",
        icon: row.icon === true,
        count: row.count ?? null,
        selected: item && row.node.id === list.selected?.id,
        text: row.text,
      };
    };
    const actions = panelState(list);
    const dropdown = dropdownState(list);
    const bar = menuBarView(current, { path: menuPath, selectedId }, platform);
    const primaryNode = list.primary;
    let breadcrumb: string[] = [];
    if (panel?.length) {
      let node = list.actions;
      breadcrumb = panel.map((id) => {
        node = panelRows(node, "", platform).find((row) => row.node.id === id)?.node;
        return text(node?.props.title);
      });
    }
    const toast = feedback.toast;
    const alert = feedback.alert;
    const dismiss = alert?.dismiss;
    const confirm = alert?.primary;
    return {
      kind,
      title: list.title,
      loading: list.loading,
      search: {
        text: searchText,
        placeholder: text(list.list?.props.searchBarPlaceholder) || "Search…",
      },
      rows: kind === "list" ? list.rows.map(rowView) : [],
      grid: list.grid
        ? list.grid.rows.map((row) => ({
            id: row.node ? row.node.id : null,
            header: row.header,
            cells: row.cells.map((cell) => ({
              id: selectionId(cell) ?? cell.id,
              title: text(cell.props.title),
              subtitle: text(cell.props.subtitle),
              content: contentGlyph(cell),
              selected: cell.id === list.selected?.id,
            })),
          }))
        : null,
      selectedId: selected,
      emptyText: list.emptyText,
      detail: list.detail,
      primary: {
        title: text(primaryNode?.props.title) || (kind === "form" ? "Submit" : "Run"),
        shortcut: shortcutLabel({ modifiers: [], key: "return" }, platform),
        enabled: !!primaryNode,
      },
      actions: {
        open: level === "panel",
        title: text(actions.node?.props.title) || "Actions",
        query: panelQuery,
        breadcrumb,
        rows: actions.rows.map((row) => ({
          id: row.node.id,
          kind: !row.item ? "section" : row.isSubmenu ? "submenu" : "action",
          title: row.title ?? row.text,
          shortcut: row.shortcut ?? "",
          selected: row.item && row.node.id === actions.chosen?.id,
        })),
        selectedIndex: actions.index,
      },
      dropdown: list.accessory
        ? {
            label: dropdownLabel(list.accessory, dropdownOptions(list.accessory)),
            tooltip: text(list.accessory.props.tooltip),
            open: level === "dropdown",
            query: dropdownQuery,
            options: dropdown.options.map((option, index) => ({
              value: option.value,
              title: option.title,
              section: option.section,
              current:
                option.value ===
                text(list.accessory?.props.value ?? list.accessory?.props.defaultValue),
              selected: index === dropdown.index,
            })),
            selectedIndex: dropdown.index,
          }
        : null,
      feedback: {
        toast: toast
          ? {
              style: toast.style,
              title: toast.title,
              message: toast.message,
              actions: toast.actions.map((action) => ({
                title: action.title,
                shortcut: shortcutLabel(action.shortcut, platform),
              })),
            }
          : null,
        hud: feedback.hud && hudVisible ? { title: feedback.hud.title } : null,
        alert: alert
          ? {
              title: alert.title,
              message: alert.message,
              rememberUserChoice: alert.rememberUserChoice,
              remember: alert.node.props.rememberChoice === true,
              primary: confirm ? { title: confirm.title, style: confirm.style } : null,
              dismiss: dismiss ? { title: dismiss.title, style: dismiss.style } : null,
            }
          : null,
      },
      menuBar: bar.menu
        ? {
            title: bar.title,
            tooltip: bar.tooltip,
            loading: bar.isLoading,
            path: bar.path,
            selectedId: bar.selected ? selectionId(bar.selected.node) : null,
            rows: bar.rows.map((row) => ({
              id: row.node.id,
              kind: !row.item ? "section" : row.isSubmenu ? "submenu" : "item",
              title: row.title ?? "",
              subtitle: row.subtitle ?? "",
              shortcut: row.shortcut ?? "",
              disabled: row.disabled,
              selected: row.item && row.node.id === bar.selected?.node.id,
            })),
          }
        : null,
      form: kind === "form" ? form.view() : null,
      requests: { quit: quitRequested, clearSearch: clearSearchRequested },
    };
  }

  return {
    scene(message) {
      current = message;
      const out = fresh();
      applyScene(out);
      return settle(out);
    },
    input(action) {
      const out = fresh();
      apply(out, action);
      return settle(out);
    },
    tick(token) {
      const out = fresh();
      if (token === `hud:${hudGeneration}`) hudVisible = false;
      for (const [key, waiting] of deferred)
        if (waiting.token === token) {
          deferred.delete(key);
          send(out, waiting.event);
        }
      return settle(out);
    },
    view: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
