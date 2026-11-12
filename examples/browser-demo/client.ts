import * as esbuild from "esbuild-wasm";
import {
  activeNode,
  createController,
  type Controller,
} from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import type { CommandMode, SceneMessage } from "../../packages/protocol/src/index.ts";
import { aliases } from "./bundle-config.ts";
import {
  bundleKey,
  bundleMatches,
  parseBundleIndex,
  sha256Hex,
  type CatalogManifest,
} from "./bundles.ts";
import { render, renderPreferences } from "../web-launcher/render.js";
import { mountRoot, updateRoot } from "./root-launcher.tsx";
import type { Root as ReactRoot } from "react-dom/client";
import {
  createBrowserCapabilities,
  createBrowserPreferenceStore,
  type CapabilityContext,
} from "./capabilities.ts";
import {
  missingPreferences,
  parsePreferences,
  preferenceDefaults,
  preferenceFields,
  type Preference,
} from "../../packages/host/src/preference-fields.ts";
import { canUseLocalFixture, isTextExtension, parseExtensionSource } from "./source.ts";
import {
  catalogCommandTitle,
  executeRootAction,
  rootActionForKey,
  rootActionModel,
  rootModel,
  validateCatalog,
  type Catalog,
  type RootActionId,
  type RootRow,
} from "./root.ts";
import { curated } from "./root.ts";
import { statusError, statusForStage, statusInfo, type DemoStatus } from "./status.ts";
import {
  applyEarlyKey,
  applyEarlyPaste,
  isReservedLabel,
  keyInputFromEvent,
  platformFromNavigator,
  RESERVED_HINT,
  shortcutAllowedInText,
  type NavigatorLike,
} from "./keyboard.ts";
import { matchesShortcut, shortcutLabel } from "../../packages/client-core/src/shortcut.ts";
import { escapeHtml } from "../web-launcher/render.js";
import { BrowserLaunchTimeoutError, createLaunchGeneration, withLaunchTimeout } from "./launch.ts";
import { acceptsRuntimePortRequest } from "./runtime-port.ts";
import {
  menuLevels,
  placeMenu,
  placeSubmenu,
  renderMenuBar,
  renderMenuLoading,
  statusItemMarkup,
} from "./menu-bar.ts";

type FileMap = Record<string, string>;
type BrowserFile = string | Uint8Array;
type SandboxRuntime = {
  execute(code: string, filename?: string): Promise<unknown>;
  getVFS(): {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, data: string | Uint8Array): void;
  };
  iframe?: HTMLIFrameElement;
  terminate?: () => void;
};
type Sandbox = { runtime: SandboxRuntime; iframe?: HTMLIFrameElement };
const asset = (path: string) => new URL(path, new URL(".", location.href)).toString();
const app = document.querySelector<HTMLElement>("#app")!;
// Raycast's ⌘ is Ctrl off macOS, for matching and for every label drawn.
const platform = platformFromNavigator(navigator as NavigatorLike);
const ACTIONS_KEY = { modifiers: ["cmd"], key: "k" };
const keyLabels = {
  primaryKey: shortcutLabel({ modifiers: [], key: "return" }, platform),
  actionsKey: shortcutLabel(ACTIONS_KEY, platform),
};
const isActionsKey = (event: KeyboardEvent) =>
  matchesShortcut(ACTIONS_KEY, keyInputFromEvent(event), platform);
const isSubmitKey = (event: KeyboardEvent) =>
  matchesShortcut({ modifiers: ["cmd"], key: "return" }, keyInputFromEvent(event), platform);
const reservedHint = (label: string) => (isReservedLabel(label, platform) ? RESERVED_HINT : "");
const commandSelect = document.querySelector<HTMLSelectElement>("#command");
let controller: Controller | undefined;
let port: MessagePort | undefined;
let runtimeFrame: Window | undefined;
let catalog: Catalog;
let rootQuery = "";
let rootSelected = 0;
let rootRows: RootRow[] = [];
let rootRenderer: ReactRoot | undefined;
let recentIds: string[] = [];
let rootOpen = true;
let actionOpen = false;
let actionQuery = "";
let actionSelected = 0;
let rootToast = "";
let statusState: DemoStatus = statusForStage("ready");
let bundleIndex: ReturnType<typeof parseBundleIndex> | undefined;
let runtimeCode: string | undefined;
let sandbox: Sandbox | undefined;
let warming: Promise<Sandbox | undefined> | undefined;
let activeCapabilityContext: CapabilityContext | undefined;
let browserCapabilities: ReturnType<typeof createBrowserCapabilities> | undefined;
let esbuildReady = false;
let preferenceForm:
  | {
      source: string;
      command: string;
      extension: Preference[];
      commandFields: Preference[];
      scope: "extension" | "command";
      store: ReturnType<typeof createBrowserPreferenceStore>;
    }
  | undefined;
let preferenceFormVisible = false;
let sessionStarting = false;
let earlyInput = "";
let activeMode: CommandMode = "view";
/** The scene the controller last saw; its active node names the view being drawn. */
let lastScene: SceneMessage | undefined;
/**
 * Scroll follows the selection only after a key press, as in Raycast; a wheel
 * or touch scroll since then leaves the list where the visitor put it.
 */
let followSelection = true;
/** What the previous extension draw showed, to tell a redraw from a new view. */
let drawn:
  | {
      key: string;
      selection: string | null;
      search: string;
      actions: number | null;
      dropdown: number | null;
    }
  | undefined;
/** The root moved its selection by a key cmdk does not handle; reveal it once. */
let revealRoot = false;
/** The last menu-bar command: its status item stays in the top bar and reopens it. */
let menuItem: { source: string; command: string; row: RootRow; title: string } | undefined;
/** A menu-bar command is starting: its menu shows a loading row under the status item. */
let menuLaunching = false;
const launchGenerations = createLaunchGeneration();
let launchStage:
  | { generation: number; resolve: () => void; reject: (error: unknown) => void }
  | undefined;
const sessionTimers = new Set<ReturnType<typeof setTimeout>>();

let extensionContext:
  | {
      extensionTitle: string;
      commandTitle: string;
      icon?: string;
      iconUrl?: string;
    }
  | undefined;

const statusForText = (text: string, error: boolean): DemoStatus => {
  if (error) return statusError(text);
  if (text === "Ready") return statusForStage("ready");
  if (text === "Fetching extension…") return statusForStage("fetching");
  if (text === "Installing…") return statusForStage("installing");
  if (text === "Bundling…") return statusForStage("bundling");
  if (text === "Starting…") return statusForStage("starting");
  return statusInfo(text);
};
const setStatus = (text: string, error = false) => {
  statusState = statusForText(text, error);
  if (catalog) {
    if (rootOpen) drawRoot();
    else if (sessionStarting && !controller) drawStarting();
    else if (controller) draw(controller.view());
    else drawRoot();
  }
};
function replaceApp(markup: string) {
  rootRenderer?.unmount();
  rootRenderer = undefined;
  const active = document.activeElement;
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  for (const control of app.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input,select,textarea")) {
    const key = control.id || control.dataset.field;
    if (key) controls.set(key, control);
  }
  app.innerHTML = markup;
  for (const next of app.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input,select,textarea")) {
    const key = next.id || next.dataset.field;
    const previous = key ? controls.get(key) : undefined;
    if (!previous || previous.dataset.starting === "true" || previous.tagName !== next.tagName)
      continue;
    const focused = active === previous;
    if (next instanceof HTMLSelectElement && previous instanceof HTMLSelectElement) {
      // `.value` only names the first selected option of a multi-select, so sync flags.
      const same =
        previous.multiple === next.multiple &&
        previous.options.length === next.options.length &&
        [...next.options].every((option, index) => option.value === previous.options[index]?.value);
      if (!same) continue;
      [...next.options].forEach((option, index) => {
        const kept = previous.options[index];
        if (kept) kept.selected = option.selected;
      });
    } else if (next instanceof HTMLInputElement && next.type === "checkbox") {
      if (previous instanceof HTMLInputElement && previous.checked !== next.checked)
        previous.checked = next.checked;
    } else if (
      !focused &&
      previous.value !== next.value &&
      // The scene never carries a password, so an unfocused field that still has one keeps it.
      !(next instanceof HTMLInputElement && next.type === "password" && "hasValue" in next.dataset)
    )
      previous.value = next.value;
    next.replaceWith(previous);
  }
}
const drawStarting = () => {
  rootRenderer?.unmount();
  rootRenderer = undefined;
  if (menuLaunching && menuItem) {
    app.innerHTML = renderMenuLoading(menuItem.title);
    syncStatusItem();
    placeMenus();
    return;
  }
  const iconMarkup = (size: number) =>
    extensionContext?.iconUrl
      ? `<img src="${escapeHtml(extensionContext.iconUrl)}" alt="" width="${size}" height="${size}">`
      : escapeHtml(extensionContext?.icon ?? "⌘");
  const extensionTitle = escapeHtml(extensionContext?.extensionTitle ?? "Extension");
  const commandTitle = escapeHtml(extensionContext?.commandTitle ?? "Command");
  // Same frame as a rendered view; the loader line under the input shows progress.
  app.innerHTML = `<main data-kind="list" data-loading="true" aria-busy="true"><header><h1>Loading command</h1><div class="search-line"><div class="breadcrumb"><span class="breadcrumb-icon">${iconMarkup(20)}</span><span>${extensionTitle}</span><span class="breadcrumb-separator">›</span><span>${commandTitle}</span></div><input id="search" data-starting="true" value="${escapeHtml(earlyInput)}" placeholder="Search…" aria-label="Search" readonly></div></header><section class="loading-stage"><span class="loading-icon">${iconMarkup(40)}</span><strong>${commandTitle}</strong><span>${escapeHtml(statusState.text)}</span></section><footer><span class="footer-context" aria-hidden="true"><span class="footer-icon">${iconMarkup(20)}</span><span class="footer-title">${extensionTitle}</span></span><span id="status" role="status" data-error="${statusState.error ? "true" : "false"}" data-stage="${statusState.stage}">${escapeHtml(statusState.text)}</span></footer></main>`;
};
/** Lists, grids and panels that scroll inside a drawn extension view. */
const SCROLLERS = [
  ".rows",
  ".grid",
  ".detail",
  ".extension-form",
  ".actions > ul",
  ".dropdown-panel ul",
  ".menu-panel",
];
/**
 * `#app` is redrawn from markup, which starts every list at the top again.
 * A redraw of the same view keeps each scroller where it was.
 */
const scrollOffsets = () =>
  SCROLLERS.flatMap((selector) =>
    [...app.querySelectorAll<HTMLElement>(selector)].map(
      (element, index) => [selector, index, element.scrollTop] as const,
    ),
  );
const restoreScrollOffsets = (offsets: ReturnType<typeof scrollOffsets>) => {
  for (const [selector, index, top] of offsets) {
    const element = app.querySelectorAll<HTMLElement>(selector)[index];
    if (element) element.scrollTop = top;
  }
};
const reveal = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "nearest" });
/** The scene's active node changes on push and pop; a redraw keeps it. */
const viewKey = (view: ReturnType<Controller["view"]>) =>
  `${activeNode(lastScene?.root)?.id ?? ""}:${view.kind}:${view.menuBar?.path.join("/") ?? ""}`;
/** The primary button takes focus so Enter confirms, as in the other clients. */
const focusAlert = (view: ReturnType<Controller["view"]>) => {
  const alertButton = document.querySelector<HTMLButtonElement>(
    "[data-alert=confirm], [data-alert=dismiss]",
  );
  if (view.feedback.alert && alertButton && !document.querySelector(".alert :focus"))
    (document.querySelector<HTMLButtonElement>("[data-alert=confirm]") ?? alertButton).focus();
};
const draw = (view: ReturnType<Controller["view"]>) => {
  const key = viewKey(view);
  const previous = drawn?.key === key ? drawn : undefined;
  const offsets = previous ? scrollOffsets() : [];
  const selection = view.menuBar?.selectedId ?? view.selectedId;
  // A new view, a new search, or a key that moved the selection brings it into
  // view; a scene that arrives after a wheel scroll leaves the offset alone.
  const follow =
    !previous ||
    view.search.text !== previous.search ||
    (followSelection && selection !== previous.selection);
  const actions = view.actions.open ? view.actions.selectedIndex : null;
  const dropdown = view.dropdown?.open ? view.dropdown.selectedIndex : null;
  drawn = { key, selection, search: view.search.text, actions, dropdown };
  if (view.kind === "menu-bar" && view.menuBar) {
    if (menuItem && view.menuBar.title) menuItem.title = view.menuBar.title;
    replaceApp(
      renderMenuBar(view, menuLevels(activeNode(lastScene?.root), view.menuBar, platform), {
        reservedHint,
      }),
    );
    syncStatusItem();
    placeMenus();
    restoreScrollOffsets(offsets);
    if (follow) reveal(".menu-panel:last-child .menu-item.selected");
    focusAlert(view);
    return;
  }
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.id || active?.dataset.field;
  const selectionStart = active?.selectionStart;
  const selectionEnd = active?.selectionEnd;
  replaceApp(
    render(view, {
      status: statusState,
      actionsKey: keyLabels.actionsKey,
      reservedHint,
      ...(extensionContext ? { context: extensionContext } : {}),
    }),
  );
  syncStatusItem();
  restoreScrollOffsets(offsets);
  const next = (
    view.form?.focusId
      ? document.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(view.form.focusId)}"]`)
      : focusKey
        ? (document.getElementById(focusKey) ??
          document.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(focusKey)}"]`))
        : undefined
  ) as HTMLInputElement | null | undefined;
  if (next) {
    // Focus that moved (Tab in a form) scrolls to its field; focus that stayed
    // put must not undo the offsets restored above.
    next.focus(view.form?.focusId !== focusKey ? undefined : { preventScroll: true });
    if (
      selectionStart !== null &&
      selectionStart !== undefined &&
      "setSelectionRange" in next &&
      !(next instanceof HTMLInputElement && next.type === "checkbox")
    )
      next.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
  }
  if (follow) reveal(".rows li.selected, .grid-cell.selected");
  if (actions !== null && actions !== previous?.actions) reveal(".actions li.selected");
  focusAlert(view);
  if (view.dropdown?.open) {
    document.querySelector<HTMLInputElement>("#dropdown-search")?.focus();
    if (dropdown !== previous?.dropdown) reveal(".dropdown-panel button.selected");
  }
  // A redraw that dropped focus (first scene, closed panel or alert, clicked
  // row) hands the caret back to the view's text field, as Raycast does, so
  // typing never needs a click first.
  const current = document.activeElement;
  const field = view.actions.open
    ? "#action-search"
    : view.kind === "list" || view.kind === "grid"
      ? "#search"
      : undefined;
  if (field && (!current || current === document.body || !current.isConnected))
    document.querySelector<HTMLInputElement>(field)?.focus();
};
/** The status item: shown once a menu-bar command ran, expanded while its menu is. */
function syncStatusItem() {
  const bar = document.querySelector<HTMLElement>(".demo-bar");
  let item = bar?.querySelector<HTMLButtonElement>("[data-status-item]");
  if (!bar || !menuItem) return item?.remove();
  if (!item) {
    item = document.createElement("button");
    item.type = "button";
    item.className = "status-item";
    item.dataset.statusItem = "";
    item.setAttribute("aria-haspopup", "menu");
    bar.insertBefore(item, bar.querySelector(".demo-github"));
  }
  const open =
    !rootOpen && ((sessionStarting && menuLaunching) || controller?.view().kind === "menu-bar");
  const markup = statusItemMarkup({
    title: menuItem.title,
    icon: menuItem.row.icon,
    ...(menuItem.row.iconUrl ? { iconUrl: menuItem.row.iconUrl } : {}),
  });
  // Rewriting identical markup would reload the icon and flicker.
  if (item.innerHTML !== markup) item.innerHTML = markup;
  item.setAttribute("aria-expanded", String(open));
  item.setAttribute("aria-label", `${menuItem.title} menu`);
}
/** Hang the menu from the status item and each open submenu beside its row. */
function placeMenus() {
  const panels = [...app.querySelectorAll<HTMLElement>(".menu-panel")];
  const anchor = document.querySelector("[data-status-item]")?.getBoundingClientRect();
  const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
  panels.forEach((panel, level) => {
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const parent = panels[level - 1];
    const row = parent?.querySelector(".menu-item.selected")?.getBoundingClientRect();
    const place =
      parent && row
        ? placeSubmenu(parent.getBoundingClientRect(), row, size, viewport)
        : placeMenu(
            anchor ?? {
              left: viewport.width,
              right: viewport.width,
              top: 0,
              bottom: document.querySelector(".demo-bar")?.getBoundingClientRect().bottom ?? 0,
            },
            size,
            viewport,
          );
    panel.style.left = `${place.left}px`;
    panel.style.top = `${place.top}px`;
    panel.style.maxHeight = `${place.maxHeight}px`;
  });
}
const readRecent = () => {
  try {
    const value = JSON.parse(globalThis.localStorage.getItem("blast.recent") ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
};
const writeRecent = (id: string) => {
  recentIds = [id, ...recentIds.filter((value) => value !== id)].slice(0, 5);
  try {
    globalThis.localStorage.setItem("blast.recent", JSON.stringify(recentIds));
  } catch {
    /* storage is optional */
  }
};
const drawRoot = () => {
  const model = rootModel(
    catalog,
    rootQuery,
    rootSelected,
    rootQuery.trim().startsWith("https://github.com/") ? rootQuery.trim() : undefined,
  );
  rootRows = model.rows;
  rootSelected = model.selected;
  const allRows = rootQuery.trim() ? rootModel(catalog, "", 0).rows : rootRows;
  const recent = allRows
    .filter((row) => recentIds.includes(row.id))
    .toSorted((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id))
    .slice(0, 5);
  const suggested = allRows
    .filter((row) => !recent.includes(row) && curated.has(row.extension))
    .slice(0, 5);
  for (const row of allRows) {
    if (suggested.length >= 5) break;
    if (
      !recent.includes(row) &&
      !suggested.includes(row) &&
      row.outcome === "rendered" &&
      !row.unavailable
    )
      suggested.push(row);
  }
  const commandRows = allRows.filter((row) => !recent.includes(row) && !suggested.includes(row));
  const actions = rootActionModel(
    rootRows[rootSelected] ?? rootRows[0],
    actionQuery,
    actionSelected,
    platform,
  );
  actionSelected = actions.selected;
  const props = {
    query: rootQuery,
    selected: rootSelected,
    rows: rootRows,
    sections: [
      { title: "Recent", rows: recent },
      { title: "Suggestions", rows: suggested },
      { title: "Commands", rows: commandRows },
    ].filter((section) => section.rows.length),
    actions: actions.actions,
    actionOpen,
    actionQuery,
    actionSelected,
    status: statusState,
    toast: rootToast,
    ...keyLabels,
    onQuery: (query) => {
      if (query !== rootQuery) revealRoot = true;
      rootQuery = query;
      rootSelected = 0;
      drawRoot();
    },
    onSelect: (id) => {
      const index = rootRows.findIndex((row) => row.id === id);
      if (index >= 0) {
        rootSelected = index;
        runSelected();
      }
    },
    onHighlight: (id) => {
      const index = rootRows.findIndex((row) => row.id === id);
      if (index >= 0) {
        rootSelected = index;
        drawRoot();
      }
    },
    onActionQuery: (query) => {
      actionQuery = query;
      actionSelected = 0;
      drawRoot();
    },
    onActionHighlight: (id: string) => {
      const index = actions.actions.findIndex((action) => action.id === id);
      if (index >= 0) actionSelected = index;
    },
    onAction: (id) => {
      const action = actions.actions.find((item) => item.id === id);
      if (action) {
        actionSelected = actions.actions.indexOf(action);
        runAction();
      }
    },
    onFooter: runFooter,
  } satisfies Parameters<typeof mountRoot>[1];
  if (!rootRenderer) rootRenderer = mountRoot(app, props);
  else updateRoot(rootRenderer, props);
  syncStatusItem();
  // cmdk scrolls its own selection into view after the keys it handles and
  // leaves pointer highlights and wheel scrolls alone; only the moves Blast
  // makes itself (Ctrl+N/P, a new query) reveal the selection here.
  if (!revealRoot) return;
  revealRoot = false;
  requestAnimationFrame(() => {
    const selected = app.querySelector('.root-item[aria-selected="true"]');
    // The first row scrolls its group heading back into view with it.
    if (selected && selected === app.querySelector(".root-item"))
      app.querySelector(".root-options")?.scrollTo({ top: 0 });
    else reveal('.root-item[aria-selected="true"]');
  });
};
/** Move the root selection by `delta` rows in the order they are drawn. */
function moveRoot(delta: 1 | -1) {
  const drawnIds = [...app.querySelectorAll<HTMLElement>(".root-item")].map(
    (item) => item.getAttribute("data-value") ?? "",
  );
  const at = drawnIds.indexOf(rootRows[rootSelected]?.id ?? "");
  const id = drawnIds[Math.max(0, Math.min(drawnIds.length - 1, at + delta))];
  const index = rootRows.findIndex((row) => row.id === id);
  if (index < 0) return;
  rootSelected = index;
  revealRoot = true;
  drawRoot();
}

function drawPreferences(scope: "extension" | "command" = "command") {
  if (!preferenceForm) return;
  const fields =
    scope === "extension"
      ? preferenceForm.extension
      : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
  const values = preferenceForm.store.values(preferenceForm.command);
  preferenceForm.scope = scope;
  const unavailable = fields
    .filter(
      (field) =>
        ["file", "directory", "appPicker"].includes(field.type) &&
        field.required &&
        field.default === undefined,
    )
    .map((field) => field.name);
  app.innerHTML = renderPreferences(
    fields,
    values,
    scope === "extension" ? "Extension preferences" : "Set up preferences",
    unavailable,
  );
  preferenceFormVisible = true;
  document.querySelector<HTMLInputElement | HTMLSelectElement>("[data-preference]")?.focus();
}
function openPreferenceForm(scope: "extension" | "command", _context: CapabilityContext) {
  drawPreferences(scope);
}
const sendInput = (value: Parameters<Controller["input"]>[0]) => {
  const result = controller?.input(value);
  if (!result || !port) return;
  processResult(result);
};
function processResult(result: ReturnType<Controller["input"]>) {
  for (const event of result.events)
    port?.postMessage({
      type: "event",
      node: event.node,
      handler: event.handler,
      args: event.args,
    });
  for (const effect of result.effects) {
    if (effect.type === "quit") {
      // `closeMainWindow()` requests a controller quit, but a no-view command
      // is complete only when the runtime publishes its actual exit status.
      if (activeMode !== "no-view") stopSession();
    } else {
      const timer = setTimeout(() => {
        sessionTimers.delete(timer);
        const next = controller?.tick(effect.token);
        if (next) processResult(next);
      }, effect.ms);
      sessionTimers.add(timer);
    }
  }
}
const githubApiPath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

function settleLaunchStage(generation: number, error?: unknown) {
  if (launchStage?.generation !== generation) return;
  const stage = launchStage;
  launchStage = undefined;
  if (error === undefined) stage.resolve();
  else stage.reject(error);
}

function handleRuntime(
  generation: number,
  message:
    | SceneMessage
    | { type: "ready" }
    | { type: "capability.request"; id: string; name: string; params: unknown }
    | { type: "exit"; code: number }
    | { type: "error"; message: string },
) {
  if (!launchGenerations.isCurrent(generation)) return;
  if (message.type === "ready") {
    setStatus("Ready");
  } else if (message.type === "scene") {
    if (!controller || rootOpen) return;
    lastScene = message;
    const result = controller.scene(message);
    const view = controller.view();
    const list = activeNode(message.root);
    const controlledSearch =
      list?.props.searchText !== undefined || list?.props.onSearchTextChange !== undefined;
    const pending = earlyInput;
    earlyInput = "";
    sessionStarting = false;
    settleLaunchStage(generation);
    const canFlush =
      pending.length > 0 &&
      (view.kind === "list" || view.kind === "grid") &&
      view.search.text === "" &&
      !controlledSearch;
    const searchResult = canFlush ? controller.input({ type: "search", text: pending }) : undefined;
    draw(controller.view());
    processResult(result);
    if (searchResult) {
      processResult(searchResult);
      draw(controller.view());
      const search = document.querySelector<HTMLInputElement>("#search");
      // The first draw already focused the field, and a redraw never overwrites
      // a focused field's text, so write the flushed keys in directly.
      if (search) search.value = controller.view().search.text;
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    }
  } else if (message.type === "capability.request") {
    if (!browserCapabilities || !activeCapabilityContext) return;
    void browserCapabilities(message, activeCapabilityContext)
      .then((result) => {
        if (!launchGenerations.isCurrent(generation)) return;
        port?.postMessage({ type: "capability.result", id: message.id, ...result });
        if (!result.ok) setStatus(result.error.message, true);
      })
      .catch((error) => {
        if (!launchGenerations.isCurrent(generation)) return;
        const text = error instanceof Error ? error.message : String(error);
        port?.postMessage({
          type: "capability.result",
          id: message.id,
          ok: false,
          error: { code: "DENIED", message: text },
        });
        setStatus(text, true);
      });
  } else if (message.type === "exit") {
    if (message.code === 0) settleLaunchStage(generation);
    if (message.code !== 0) {
      if (!statusState.error) setStatus(`Command exited with code ${message.code}`, true);
      return;
    }
    const view = controller?.view();
    document.body.dataset.commandExit = "0";
    const toast = view?.feedback.toast;
    const feedbackTitle = view?.feedback.hud?.title || toast?.title;
    stopSession(
      feedbackTitle ? feedbackTitle : `${extensionContext?.commandTitle ?? "Command"} finished`,
      toast?.style === "failure" || statusState.error,
    );
  } else if (message.type === "error") setStatus(message.message, true);
}

async function fetchFiles(source: string): Promise<{
  files: Map<string, BrowserFile>;
  manifest: Record<string, unknown>;
  lockfile?: string;
  root: string;
}> {
  const parsed = parseExtensionSource(source);
  const files = new Map<string, BrowserFile>();
  const read = async (path: string, url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
        throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
      throw new Error(`Unable to fetch ${path} (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const value: BrowserFile = isTextExtension(path) ? new TextDecoder().decode(bytes) : bytes;
    files.set(`/${path}`, value);
    return value;
  };
  let root = parsed.path;
  let paths: string[];
  const allowFixtures =
    Object.getOwnPropertyDescriptor(globalThis, "__BLAST_FIXTURES__")?.value === true;
  if (canUseLocalFixture(parsed, allowFixtures)) {
    const localBase = asset(
      `fixtures/${encodeURIComponent(parsed.path.replace(/^extensions\//, ""))}`,
    );
    const localListing = await fetch(`${localBase}/__files`).catch(() => undefined);
    if (localListing?.ok) {
      paths = (await localListing.json()) as string[];
      root = parsed.path.replace(/^extensions\//, "");
      for (const path of paths) await read(path, `${localBase}/${path}`);
    } else paths = [];
  } else paths = [];
  if (paths.length === 0) {
    const list = async (path: string): Promise<string[]> => {
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${githubApiPath(path)}?ref=${encodeURIComponent(parsed.ref)}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) {
        if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
          throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
        throw new Error(`Unable to list GitHub extension files (${response.status})`);
      }
      const entries = (await response.json()) as Array<{ path?: string; type?: string }>;
      const result: string[] = [];
      for (const entry of entries) {
        if (!entry.path || entry.path.split("/").includes("node_modules")) continue;
        if (entry.type === "dir") result.push(...(await list(entry.path)));
        else if (entry.type === "file") result.push(entry.path.slice(parsed.path.length + 1));
      }
      return result;
    };
    paths = await list(parsed.path);
    if (!paths.includes("package.json")) throw new Error("Extension package.json was not found");
    for (const path of paths)
      await read(
        path,
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(parsed.ref)}/${parsed.path}/${path}`,
      );
  }
  const manifest = JSON.parse(String(files.get("/package.json"))) as Record<string, unknown>;
  const commands = (manifest.commands as Array<{ name?: string }> | undefined) ?? [];
  commandSelect?.replaceChildren();
  for (const command of commands) {
    if (typeof command.name !== "string") continue;
    const option = document.createElement("option");
    option.value = command.name;
    option.textContent = command.name;
    commandSelect?.append(option);
  }
  if (commandSelect) commandSelect.hidden = commandSelect.options.length < 2;
  const lockfile = files.get("/package-lock.json");
  return { files, manifest, root, ...(typeof lockfile === "string" ? { lockfile } : {}) };
}

function commandEntry(files: Map<string, BrowserFile>, name: string): string {
  for (const extension of ["tsx", "ts", "jsx", "js"]) {
    const path = `/src/${name}.${extension}`;
    if (files.has(path)) return path;
  }
  if (files.has("/src/index.tsx")) return "/src/index.tsx";
  throw new Error(`Command source not found for ${name}`);
}

async function launch(
  source: string,
  commandName: string,
  selectedRow: RootRow | undefined = rootRows[rootSelected],
): Promise<void> {
  const previousStage = launchStage;
  launchStage = undefined;
  const generation = launchGenerations.next();
  previousStage?.resolve();
  const stillCurrent = () => launchGenerations.isCurrent(generation);
  earlyInput = "";
  delete document.body.dataset.commandExit;
  sessionStarting = true;
  rootOpen = false;
  actionOpen = false;
  lastScene = undefined;
  drawn = undefined;
  extensionContext = selectedRow
    ? {
        extensionTitle: selectedRow.subtitle,
        commandTitle: selectedRow.title,
        icon: selectedRow.icon,
        ...(selectedRow.iconUrl ? { iconUrl: selectedRow.iconUrl } : {}),
      }
    : undefined;
  const selectedCommand = commandName || commandSelect?.value || "index";
  if (selectedRow) writeRecent(selectedRow.id);
  // The catalog knows a menu-bar command before its bundle loads, so its menu
  // can open under the status item at once instead of after a launcher frame.
  menuLaunching =
    selectedRow !== undefined &&
    catalog.extensions
      .find((entry) => entry.name === selectedRow.extension)
      ?.commands.find((entry) => entry.name === selectedCommand)?.mode === "menu-bar";
  if (menuLaunching && selectedRow) rememberMenuItem(source, selectedCommand, selectedRow);
  const catalogSource = source.startsWith("https://github.com/raycast/extensions/tree/");
  const bundle = catalogSource ? await prebuiltBundle(source, selectedCommand) : undefined;
  if (!stillCurrent()) return;
  let extension: Awaited<ReturnType<typeof fetchFiles>>;
  let command: string;
  let bundled: { code: string; files?: Map<string, BrowserFile> };
  if (bundle) {
    extension = { files: bundle.files, manifest: bundle.manifest, root: "" };
    command = `/src/${selectedCommand}.tsx`;
    bundled = bundle;
    setStatus("Starting prebuilt bundle…");
  } else {
    setStatus("Fetching extension…");
    extension = await fetchFiles(source);
    if (!stillCurrent()) return;
    const sourceFiles = (await (await fetch(asset("blast-sources.json"))).json()) as FileMap;
    if (!stillCurrent()) return;
    const files = new Map<string, BrowserFile>(Object.entries(sourceFiles));
    for (const [path, value] of extension.files) files.set(path, value);
    command = commandEntry(extension.files, selectedCommand);
    setStatus("Installing…");
    const installed = await installForBrowser({
      fetch: (value, init) => fetch(value, init),
      manifest: extension.manifest,
      ...(extension.lockfile === undefined ? {} : { lockfile: extension.lockfile }),
    });
    if (!stillCurrent()) return;
    setStatus("Bundling…");
    if (!esbuildReady) {
      await esbuild.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
      esbuildReady = true;
    }
    if (!stillCurrent()) return;
    bundled = await bundleForBrowser({
      esbuild,
      files,
      packages: installed.packages,
      command,
      runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
      aliases,
    });
    if (!stillCurrent()) return;
  }
  const preferenceFieldsRaw = (extension.manifest.preferences as unknown[] | undefined) ?? [];
  const commandDeclarations = extension.manifest.commands;
  const commandDeclaration = Array.isArray(commandDeclarations)
    ? commandDeclarations.find(
        (item) => item && typeof item === "object" && item.name === selectedCommand,
      )
    : undefined;
  const commandPreferenceValue = Array.isArray(commandDeclarations)
    ? commandDeclaration?.preferences
    : (commandDeclarations as Record<string, unknown> | undefined)?.[selectedCommand];
  const extensionPreferences = parsePreferences(preferenceFieldsRaw, "Extension preferences");
  const commandPreferences = parsePreferences(
    commandPreferenceValue,
    `Command ${selectedCommand} preferences`,
  );
  const catalogMode = catalogSource
    ? catalog.extensions
        .find(
          (catalogExtension) =>
            catalogExtension.name === new URL(source).pathname.split("/").filter(Boolean).at(-1),
        )
        ?.commands.find((catalogCommand) => catalogCommand.name === selectedCommand)?.mode
    : undefined;
  const declaredMode = Array.isArray(commandDeclarations)
    ? commandDeclaration && typeof commandDeclaration === "object"
      ? (commandDeclaration as Record<string, unknown>).mode
      : undefined
    : undefined;
  const modeValue = bundle?.manifest.modes?.[selectedCommand] ?? declaredMode ?? catalogMode;
  activeMode =
    modeValue === "no-view" || modeValue === "menu-bar" || modeValue === "model-provider"
      ? modeValue
      : "view";
  if (activeMode === "menu-bar" && selectedRow && !menuLaunching)
    rememberMenuItem(source, selectedCommand, selectedRow);
  let preferenceStorage;
  try {
    preferenceStorage = globalThis.localStorage;
  } catch {
    preferenceStorage = undefined;
  }
  const preferenceStore = createBrowserPreferenceStore(
    String(extension.manifest.name ?? source),
    preferenceStorage,
  );
  const fields = preferenceFields(extensionPreferences, commandPreferences);
  const values = {
    ...preferenceDefaults(extensionPreferences, commandPreferences),
    ...preferenceStore.values(selectedCommand),
  };
  const missing = missingPreferences(fields, values);
  preferenceForm = {
    source,
    command: selectedCommand,
    extension: extensionPreferences,
    commandFields: commandPreferences,
    scope: "command",
    store: preferenceStore,
  };
  if (missing.length) {
    sessionStarting = false;
    earlyInput = "";
    rootOpen = false;
    drawPreferences();
    return;
  }
  preferenceFormVisible = false;
  activeCapabilityContext = {
    extensionName: String(extension.manifest.name ?? source),
    commandName: selectedCommand,
    source,
  };
  const active = await acquireSandbox();
  if (!stillCurrent()) return;
  const extensionName = String(extension.manifest.name ?? source);
  const pathSegment = extensionName.replace(/[^A-Za-z0-9._-]/gu, "_") || "extension";
  const supportPath = `/blast/support/${pathSegment}`;
  const assetsPath = `/blast/assets/${pathSegment}`;
  const vfs = active.runtime.getVFS();
  vfs.mkdirSync(supportPath, { recursive: true });
  vfs.mkdirSync(assetsPath, { recursive: true });
  // A marker syncs directories created after a warmed sandbox was initialized.
  vfs.writeFileSync(`${supportPath}/.keep`, "");
  vfs.writeFileSync(`${assetsPath}/.keep`, "");
  for (const [path, value] of extension.files) {
    if (path.includes("/node_modules/")) continue;
    const relativePath = path.startsWith("/assets/")
      ? path.slice("/assets/".length)
      : path.startsWith("/src/")
        ? /\.(?:cjs|css|html?|js|jsx|mjs|ts|tsx)$/iu.test(path)
          ? undefined
          : path.slice("/src/".length)
        : path.replace(/^\//u, "");
    if (!relativePath) continue;
    const target = `${assetsPath}/${relativePath}`;
    vfs.mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    vfs.writeFileSync(target, value);
    if (path === "/package.json") vfs.writeFileSync("/blast/assets/package.json", value);
  }
  const channel = new MessageChannel();
  port = channel.port1;
  port.start();
  port.addEventListener("message", (event) => handleRuntime(generation, event.data));
  let transferred = false;
  let resolvePort!: () => void;
  let rejectPort!: (error: unknown) => void;
  const portReady = new Promise<void>((resolve, reject) => {
    resolvePort = resolve;
    rejectPort = reject;
  });
  const transferPort = (event: MessageEvent) => {
    if (!stillCurrent()) return;
    if (!acceptsRuntimePortRequest(event.source, runtimeFrame, transferred, event.data)) return;
    transferred = true;
    window.removeEventListener("message", transferPort);
    runtimeFrame?.postMessage({ type: "blast-port" }, "*", [channel.port2]);
    resolvePort();
  };
  window.addEventListener("message", transferPort);
  try {
    await withLaunchTimeout(
      (async () => {
        await active.runtime.execute(
          `${bundled.code}\nmodule.exports = null;`,
          `${assetsPath}/bundle.cjs`,
        );
        if (!stillCurrent()) return;
        await portReady;
      })(),
      30_000,
      "waiting for runtime port",
    );
  } catch (error) {
    window.removeEventListener("message", transferPort);
    rejectPort(error);
    if (!stillCurrent()) return;
    if (error instanceof BrowserLaunchTimeoutError) throw error;
    throw new Error(`Runtime failed: ${String(error)}`, { cause: error });
  }
  if (!stillCurrent() || !transferred) return;
  const commandTitle =
    extensionContext?.commandTitle ?? catalogCommandTitle(catalog, source, selectedCommand);
  controller = createController({
    platform,
    ...(commandTitle ? { fallbackTitle: commandTitle } : {}),
  });
  const launchController = controller;
  controller.subscribe((view) => {
    if (stillCurrent() && controller === launchController && !rootOpen) draw(view);
  });
  const firstScene = new Promise<void>((resolve, reject) => {
    launchStage = { generation, resolve, reject };
  });
  const initTimer = setTimeout(
    () =>
      port?.postMessage({
        type: "init",
        protocol: 1,
        command: {
          extension: String(extension.manifest.name ?? source),
          name: selectedCommand,
          entry: command,
          mode: activeMode,
        },
        preferences: { ...values },
        environment: {
          extensionName,
          commandName: selectedCommand,
          ownerOrAuthorName: "Browser",
          assetsPath,
          supportPath,
          isDevelopment: false,
          appearance: "dark",
          textSize: "medium",
        },
      }),
    250,
  );
  sessionTimers.add(initTimer);
  setStatus("Starting…");
  try {
    await withLaunchTimeout(firstScene, 30_000, "waiting for first scene");
  } finally {
    if (launchGenerations.isCurrent(generation)) launchStage = undefined;
  }
}

async function loadBundleIndex() {
  if (bundleIndex) return bundleIndex;
  const [indexResponse, buildResponse] = await Promise.all([
    fetch(asset("bundles.json")),
    fetch(asset("../build.json")),
  ]);
  if (!indexResponse.ok || !buildResponse.ok) return undefined;
  const index = parseBundleIndex(await indexResponse.json());
  const build = (await buildResponse.json()) as { sha?: unknown };
  if (typeof build.sha !== "string" || build.sha !== index.buildSha) return undefined;
  bundleIndex = index;
  return index;
}

async function loadRuntimeCode(): Promise<string | undefined> {
  if (runtimeCode !== undefined) return runtimeCode;
  const index = await loadBundleIndex();
  if (!index?.runtime) return undefined;
  const response = await fetch(asset(index.runtime.path));
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  if (index.runtime.bytes !== bytes.byteLength || (await sha256Hex(bytes)) !== index.runtime.sha256)
    return undefined;
  runtimeCode = new TextDecoder().decode(bytes);
  return runtimeCode;
}

async function prebuiltBundle(
  source: string,
  command: string,
): Promise<
  { code: string; files: Map<string, BrowserFile>; manifest: CatalogManifest } | undefined
> {
  try {
    const index = await loadBundleIndex();
    if (!index) return undefined;
    const parts = new URL(source).pathname.split("/").filter(Boolean);
    const treeIndex = parts.indexOf("tree");
    const extension = treeIndex >= 0 ? parts[treeIndex + 3] : undefined;
    if (!extension) return undefined;
    const key = bundleKey(extension, command);
    const entry = index.bundles[key];
    if (!entry) return undefined;
    const response = await fetch(asset(entry.path));
    if (!response.ok) return undefined;
    const bytes = await response.arrayBuffer();
    if (!(await bundleMatches(index, index.buildSha, key, bytes))) return undefined;
    const files = new Map<string, BrowserFile>();
    for (const [name, file] of Object.entries(entry.files ?? {})) {
      const assetResponse = await fetch(asset(file.path));
      if (!assetResponse.ok) return undefined;
      const assetBytes = await assetResponse.arrayBuffer();
      if (assetBytes.byteLength !== file.bytes || (await sha256Hex(assetBytes)) !== file.sha256)
        return undefined;
      files.set(
        `/${name}`,
        /\.(?:cjs|css|html?|js|jsx|json|md|mjs|ts|tsx|txt|yaml|yml)$/iu.test(name)
          ? new TextDecoder().decode(assetBytes)
          : new Uint8Array(assetBytes),
      );
    }
    // An index without manifest data predates 0133; the source path still has
    // the full package.json, so fall back to it.
    if (!entry.manifest) return undefined;
    return { code: new TextDecoder().decode(bytes), files, manifest: entry.manifest };
  } catch {
    return undefined;
  }
}

/** Create the cross-origin sandbox and load the shared runtime before any command code. */
async function createSandbox(kind: "warm" | "session"): Promise<Sandbox> {
  const almost = (await import(asset("almostnode.mjs"))) as unknown as {
    VirtualFS: new () => unknown;
    createRuntime: (
      vfs: unknown,
      options: { sandbox: string },
    ) => Promise<{
      execute(code: string, filename?: string): Promise<unknown>;
      getVFS(): {
        mkdirSync(path: string, options?: { recursive?: boolean }): void;
        writeFileSync(path: string, data: string): void;
      };
      iframe?: HTMLIFrameElement;
      terminate?: () => void;
    }>;
  };
  const runtime = await almost.createRuntime(new almost.VirtualFS(), {
    sandbox:
      ((globalThis as Record<string, unknown>)["__BLAST_SANDBOX__"] as string | undefined) ?? "",
  });
  runtime.iframe?.setAttribute("data-blast", kind);
  sandbox = { runtime, ...(runtime.iframe ? { iframe: runtime.iframe } : {}) };
  runtimeFrame = runtime.iframe?.contentWindow ?? undefined;
  const code = await loadRuntimeCode();
  if (code) await runtime.execute(`${code}\nmodule.exports = null;`, "/runtime.cjs");
  return sandbox;
}

function discardSandbox() {
  const current = sandbox;
  sandbox = undefined;
  runtimeFrame = undefined;
  try {
    current?.runtime.terminate?.();
  } catch {
    // A sandbox that never finished initializing has nothing to terminate.
  }
  document.querySelector("iframe[data-blast]")?.remove();
}

function warmIdle() {
  warmSandbox();
}

function scheduleWarm() {
  const idle = (
    globalThis as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(warmIdle, { timeout: 1500 });
  else setTimeout(warmIdle, 200);
}

function warmSandbox() {
  if (sandbox || warming) return;
  warming = (async () => {
    const index = await loadBundleIndex();
    if (!index?.runtime) return undefined;
    try {
      return await createSandbox("warm");
    } catch {
      discardSandbox();
      return undefined;
    }
  })().finally(() => {
    warming = undefined;
  });
}

/** Reuse the idle sandbox when it is ready; otherwise start a fresh session. */
async function acquireSandbox(): Promise<Sandbox> {
  if (warming) await warming;
  const current = sandbox;
  if (current) {
    current.runtime.iframe?.setAttribute("data-blast", "session");
    return current;
  }
  return createSandbox("session");
}

function rememberMenuItem(source: string, command: string, row: RootRow) {
  if (menuItem?.source !== source || menuItem.command !== command)
    menuItem = { source, command, row, title: row.title };
}

function stopSession(message = "Ready", error = false) {
  const pendingStage = launchStage;
  launchStage = undefined;
  launchGenerations.next();
  pendingStage?.resolve();
  sessionStarting = false;
  menuLaunching = false;
  lastScene = undefined;
  drawn = undefined;
  earlyInput = "";
  for (const timer of sessionTimers) clearTimeout(timer);
  sessionTimers.clear();
  port?.close();
  port = undefined;
  controller = undefined;
  discardSandbox();
  rootOpen = true;
  extensionContext = undefined;
  activeCapabilityContext = undefined;
  setStatus(message, error);
  drawRoot();
  scheduleWarm();
}

function backFromExtension() {
  const result = controller?.input({ type: "back" });
  if (!result) return stopSession();
  processResult(result);
  if (controller && !result.effects.some((effect) => effect.type === "quit"))
    draw(controller.view());
}

function runSelected() {
  const selected = rootRows[rootSelected];
  if (!selected) return;
  const source =
    selected.url ??
    `https://github.com/raycast/extensions/tree/${catalog.commit}/extensions/${selected.extension}`;
  launchFromLauncher(source, selected.command, selected);
}

function launchFromLauncher(source: string, command: string, row: RootRow) {
  void launch(source, command, row).catch((error: unknown) => {
    const message =
      error instanceof BrowserLaunchTimeoutError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    stopSession(message, true);
  });
}

function runAction() {
  const row = rootRows[rootSelected];
  const action = rootActionModel(row, actionQuery, actionSelected, platform).actions[
    actionSelected
  ];
  if (row && action) runRootAction(action.id);
}

function runRootAction(id: RootActionId) {
  const row = rootRows[rootSelected];
  if (!row) return;
  const result = executeRootAction(row, id);
  if (result.type === "run") {
    actionOpen = false;
    drawRoot();
    runSelected();
  } else if (result.type === "open") {
    window.open(result.url, "_blank", "noopener");
    actionOpen = false;
    drawRoot();
  } else {
    actionOpen = false;
    actionQuery = "";
    actionSelected = 0;
    void navigator.clipboard.writeText(result.url).then(
      () => {
        rootToast = "Copied extension URL";
        setStatus("Copied extension URL");
        drawRoot();
      },
      () => setStatus("Could not copy the extension URL", true),
    );
  }
}

async function start() {
  try {
    catalog = validateCatalog(await (await fetch(asset("catalog.json"))).json());
    let storage;
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = undefined;
    }
    recentIds = readRecent();
    browserCapabilities = createBrowserCapabilities({
      catalog,
      ...(storage ? { storage } : {}),
      clipboard: {
        readText: () => navigator.clipboard.readText(),
        writeText: (text) => navigator.clipboard.writeText(text),
      },
      openUrl: (url) => window.open(url, "_blank", "noopener"),
      launchCommand: (source, command) => launch(source, command),
      status: (message) => setStatus(message),
      openPreferences: openPreferenceForm,
    });
    const params = new URLSearchParams(location.search);
    const extension = params.get("ext");
    const command = params.get("cmd");
    if (extension && command)
      return void launch(extension, command).catch((error) => setStatus(String(error), true));
    drawRoot();
    setStatus("Ready");
    scheduleWarm();
  } catch (error) {
    setStatus(String(error), true);
  }
}

/** Answer the open alert; the remember checkbox travels with either answer. */
function answerAlert(confirm: boolean) {
  const remember = document.querySelector<HTMLInputElement>("#alert-remember")?.checked;
  sendInput({
    type: "alert",
    confirm,
    ...(remember === undefined ? {} : { remember }),
  });
}
/** The alert is modal: Enter confirms, Escape dismisses, Tab stays inside it. */
function alertKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    answerAlert(false);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const focused = document.activeElement?.closest<HTMLElement>("[data-alert]");
    answerAlert(focused?.dataset.alert !== "dismiss");
  } else if (event.key === "Tab") {
    event.preventDefault();
    const stops = [...document.querySelectorAll<HTMLElement>(".alert button, .alert input")];
    if (!stops.length) return;
    const index = stops.findIndex((stop) => stop === document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    const next = index < 0 ? (event.shiftKey ? stops.length - 1 : 0) : index + step;
    stops[(next + stops.length) % stops.length]?.focus();
  }
}
/** An open search-bar dropdown owns the arrows, Enter and Escape; its filter keeps typing. */
function dropdownKey(event: KeyboardEvent) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    sendInput({ type: "move", direction: event.key === "ArrowDown" ? "down" : "up" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "chooseDropdown" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    sendInput({ type: "back" });
  } else if (event.key === "Tab") event.preventDefault();
}

// Capture phase, before cmdk and before the browser's own default for combos
// such as ⌘R, ⌘D, ⌘P, ⌘S, ⌘F and ⌘[: a modifier combo the root or the
// extension declares goes to it, and anything else keeps its browser meaning.
// Combos the browser never delivers are labelled by `reservedHint` instead.
window.addEventListener(
  "keydown",
  (event) => {
    if (event.isComposing || !(event.metaKey || event.ctrlKey || event.altKey)) return;
    const press = keyInputFromEvent(event);
    if (rootOpen) {
      const id = rootRenderer && rootActionForKey(rootRows[rootSelected], press, platform);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      runRootAction(id);
      return;
    }
    const view = controller?.view();
    if (!controller || !view || view.feedback.alert || view.dropdown?.open) return;
    const result = controller.input({ type: "key", key: press });
    if (!result.handled) return;
    event.preventDefault();
    event.stopPropagation();
    processResult(result);
  },
  { capture: true },
);

// Any key may move the selection; a wheel or touch scroll means the visitor is
// looking elsewhere, so redraws stop pulling the selection into view.
window.addEventListener("keydown", () => (followSelection = true), { capture: true });
for (const type of ["wheel", "touchmove"])
  window.addEventListener(type, () => (followSelection = false), {
    capture: true,
    passive: true,
  });
window.addEventListener("resize", () => {
  if (app.querySelector(".menu-panel")) placeMenus();
});

/** A text field keeps plain typing; see `shortcutAllowedInText`. */
const typingIn = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const text =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(target.type));
  return text && !shortcutAllowedInText(event);
};

document.addEventListener("keydown", (event) => {
  if (sessionStarting && !controller && !rootOpen) {
    const next = applyEarlyKey(earlyInput, event);
    if (next !== undefined) {
      event.preventDefault();
      earlyInput = next;
      drawStarting();
      return;
    }
  }
  const modalView = rootOpen ? undefined : controller?.view();
  if (modalView?.feedback.alert) return alertKey(event);
  if (modalView?.dropdown?.open) return dropdownKey(event);
  if (!rootOpen && controller) {
    if (controller.view().kind === "menu-bar") {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        sendInput({ type: "move", direction: "left" });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        sendInput({ type: "back" });
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        sendInput({ type: "primary" });
        return;
      }
    }
    const result = typingIn(event)
      ? undefined
      : controller.input({ type: "key", key: keyInputFromEvent(event) });
    if (result?.handled) {
      event.preventDefault();
      processResult(result);
      return;
    }
  }
  if (rootOpen) {
    if (rootRenderer && !actionOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (rootQuery) {
          rootQuery = "";
          rootSelected = 0;
          revealRoot = true;
          drawRoot();
        }
      } else if (isActionsKey(event)) {
        event.preventDefault();
        actionOpen = true;
        actionQuery = "";
        actionSelected = 0;
        drawRoot();
      } else if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        moveRoot(1);
      } else if (event.ctrlKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        moveRoot(-1);
      }
      return;
    }
    if (actionOpen) {
      const actionCount = rootActionModel(
        rootRows[rootSelected],
        actionQuery,
        actionSelected,
        platform,
      ).actions.length;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        actionSelected = Math.min(actionSelected + 1, actionCount - 1);
        drawRoot();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        actionSelected = Math.max(actionSelected - 1, 0);
        drawRoot();
      } else if (event.key === "Enter") {
        event.preventDefault();
        runAction();
      } else if (event.key === "Escape") {
        event.preventDefault();
        actionOpen = false;
        actionQuery = "";
        actionSelected = 0;
        drawRoot();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (rootQuery) {
        rootQuery = "";
        rootSelected = 0;
        drawRoot();
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      rootSelected = Math.min(rootSelected + 1, rootRows.length - 1);
      drawRoot();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      rootSelected = Math.max(rootSelected - 1, 0);
      drawRoot();
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSelected();
    } else if (isActionsKey(event)) {
      event.preventDefault();
      actionOpen = true;
      actionQuery = "";
      actionSelected = 0;
      drawRoot();
    }
  } else if (isActionsKey(event)) {
    event.preventDefault();
    toggleExtensionActions();
  } else if (controller?.view().kind === "form" && event.key === "Tab") {
    event.preventDefault();
    sendInput({ type: event.shiftKey ? "focusPrev" : "focusNext" });
  } else if (controller?.view().kind === "form" && isSubmitKey(event)) {
    event.preventDefault();
    sendInput({ type: "submit" });
  } else if (controller?.view().kind === "form" && event.key === " ") {
    const field = controller.view().form?.fields.find((candidate) => candidate.focused);
    if (field?.type === "Form.Checkbox") {
      event.preventDefault();
      sendInput({ type: "toggle", id: field.id });
    }
  } else if (
    controller &&
    controller.view().kind !== "form" &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    ["n", "p"].includes(event.key.toLowerCase())
  ) {
    // Ctrl+N / Ctrl+P move like ↓/↑ in pushed views too, as in the root.
    event.preventDefault();
    sendInput({ type: "move", direction: event.key.toLowerCase() === "n" ? "down" : "up" });
  } else if (
    controller &&
    ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)
  ) {
    const view = controller.view();
    const vertical = event.key === "ArrowDown" || event.key === "ArrowUp";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    // Vertical arrows select list rows; horizontal arrows are grid navigation.
    // Form fields and text inputs keep all arrow keys for caret movement.
    if ((vertical && view.kind !== "form") || (horizontal && view.kind === "grid")) {
      event.preventDefault();
      sendInput({
        type: "move",
        direction: (
          { ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right" } as const
        )[event.key],
      });
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "primary" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    // The controller closes an open action panel on back before leaving the view.
    if (preferenceFormVisible) {
      preferenceFormVisible = false;
      rootOpen = true;
      drawRoot();
    } else if (controller?.view().actions.open || controller?.view().dropdown?.open) {
      backFromExtension();
    } else if (controller?.view().search.text) {
      sendInput({ type: "search", text: "" });
      // Keep the focused control in sync while the extension sends its next scene.
      const search = document.querySelector<HTMLInputElement>("#search");
      if (search) search.value = "";
    } else backFromExtension();
  }
});

function toggleExtensionActions() {
  if (!controller) return;
  sendInput({ type: controller.view().actions.open ? "closeActions" : "openActions" });
  draw(controller.view());
}

/** A footer button does exactly what its key does, in either view. */
function runFooter(action: string) {
  if (rootOpen) {
    if (action === "primary") runSelected();
    else if (action === "actions") {
      actionOpen = !actionOpen;
      actionQuery = "";
      actionSelected = 0;
      drawRoot();
    } else if (action === "back") stopSession();
  } else if (action === "primary") sendInput({ type: "primary" });
  else if (action === "actions") toggleExtensionActions();
  else if (action === "back") backFromExtension();
}
function preferenceFormValues(
  form: HTMLFormElement,
  fields: Preference[],
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    const input = form.elements.namedItem(field.name) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (input)
      values[field.name] =
        input instanceof HTMLInputElement && input.type === "checkbox"
          ? input.checked
          : input.value;
  }
  return values;
}
// Pressing a row, list background or button activates it on click but never
// takes focus, so the caret stays in the search field. Text controls and
// labels still take focus normally, and Detail text stays selectable.
document.addEventListener("mousedown", (event) => {
  const target = event.target as Element | null;
  if (target?.closest("[data-status-item]")) return event.preventDefault();
  if (!target?.closest("#app") || target.closest("input, textarea, select, label, .detail")) return;
  event.preventDefault();
});
// Clicking into a field must move the controller's focus too, or the next redraw
// would pull the caret back to the field the controller still considers focused.
document.addEventListener("focusin", (event) => {
  const field = (event.target as HTMLElement).dataset?.field;
  if (field && controller?.view().form?.focusId !== field) sendInput({ type: "focus", id: field });
});
document.addEventListener("paste", (event) => {
  if (!sessionStarting || controller || rootOpen) return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text) return;
  event.preventDefault();
  earlyInput = applyEarlyPaste(earlyInput, text);
  drawStarting();
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.closest("#preferences-form") && preferenceForm) {
    const fields =
      preferenceForm.scope === "extension"
        ? preferenceForm.extension
        : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
    const form = document.querySelector<HTMLFormElement>("#preferences-form");
    const missing = form
      ? missingPreferences(fields, preferenceFormValues(form, fields)).length > 0
      : true;
    const submit = document.querySelector<HTMLButtonElement>(
      '#preferences-form button[type="submit"]',
    );
    if (submit) submit.disabled = missing;
    return;
  }
  if (target.id === "root-search") {
    if (target.value !== rootQuery) revealRoot = true;
    rootQuery = target.value;
    rootSelected = 0;
    drawRoot();
  } else if (target.id === "root-action-search") {
    actionQuery = target.value;
    actionSelected = 0;
    drawRoot();
  } else if (target.id === "search") sendInput({ type: "search", text: target.value });
  else if (target.id === "dropdown-search")
    sendInput({ type: "dropdownQuery", text: target.value });
  else if (target.id === "action-search") sendInput({ type: "actionsQuery", text: target.value });
  else if (target.dataset.field && target instanceof HTMLInputElement && target.type === "checkbox")
    sendInput({ type: "toggle", id: target.dataset.field });
  else if (target.dataset.field && !(target instanceof HTMLSelectElement))
    // A select reports through "change"; a setValue would filter a Dropdown's options.
    sendInput({ type: "setValue", id: target.dataset.field, value: target.value });
});
/** Resolve once the controller publishes its next view, or after `ms`. */
function nextView(active: Controller, ms = 2000) {
  return new Promise<void>((resolve) => {
    const stop = active.subscribe(() => done());
    const timer = setTimeout(() => done(), ms);
    function done() {
      stop();
      clearTimeout(timer);
      resolve();
    }
  });
}
/**
 * Make a Dropdown or TagPicker hold exactly `wanted`. `optionChoose` toggles one
 * option and its onChange builds on the extension's current value, so toggle one
 * at a time and wait for the scene that reflects it before the next.
 */
async function syncFieldOptions(fieldId: string, wanted: Set<string>, multiple: boolean) {
  const active = controller;
  if (!active) return;
  sendInput({ type: "focus", id: fieldId });
  for (let step = 0; step < 64; step++) {
    const field = active.view().form?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    const have = new Set(field.selected.map((option) => option.value));
    // A Dropdown choice replaces its value, so only a missing option needs choosing.
    const index = field.options.findIndex((option) =>
      multiple
        ? wanted.has(option.value) !== have.has(option.value)
        : wanted.has(option.value) && !have.has(option.value),
    );
    if (index < 0) return;
    const changed = nextView(active);
    sendInput({ type: "optionMove", delta: index - field.optionIndex });
    sendInput({ type: "optionChoose" });
    await changed;
  }
}
document.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (!(target instanceof HTMLSelectElement) || !target.dataset.field) return;
  const wanted = new Set(
    target.multiple ? [...target.selectedOptions].map((option) => option.value) : [target.value],
  );
  void syncFieldOptions(target.dataset.field, wanted, target.multiple);
});
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-status-item]")) {
    toggleMenu();
    return;
  }
  // Like a macOS menu, a click anywhere outside it closes it.
  if (target.matches(".menu-window, .menu-window > nav")) {
    stopSession();
    return;
  }
  if (target.closest("[data-preference-back]")) {
    preferenceFormVisible = false;
    rootOpen = true;
    drawRoot();
    return;
  }
  if (target.closest("#preferences-form")) return;
  if (target.closest("[data-dropdown-open]")) {
    if (!controller) return;
    sendInput({ type: "openDropdown" });
    draw(controller.view());
    return;
  }
  const dropdownValue = target.closest<HTMLElement>("[data-dropdown-value]")?.dataset.dropdownValue;
  if (dropdownValue !== undefined) {
    const view = controller?.view();
    const option =
      view?.dropdown?.options.findIndex((candidate) => candidate.value === dropdownValue) ?? -1;
    const current = view?.dropdown?.selectedIndex ?? 0;
    if (option >= 0)
      for (let index = current; index !== option; index += option > current ? 1 : -1)
        sendInput({ type: "move", direction: option > current ? "down" : "up" });
    sendInput({ type: "chooseDropdown" });
    return;
  }
  const alertAction = target.closest<HTMLElement>("[data-alert]")?.dataset.alert;
  if (alertAction) {
    answerAlert(alertAction === "confirm");
    return;
  }
  const toastAction = target.closest<HTMLElement>("[data-toast-action]")?.dataset.toastAction;
  if (toastAction !== undefined) {
    sendInput({ type: "toastAction", index: Number(toastAction) });
    return;
  }
  if (rootRenderer && rootOpen) return;
  const footer = target.closest<HTMLElement>("[data-footer]")?.dataset.footer;
  if (footer !== undefined) {
    runFooter(footer);
    return;
  }
  if (rootOpen) return;
  // In an extension view, clicking a row selects it; clicking an action runs it.
  const actionIndex = target.closest<HTMLElement>("[data-action-index]")?.dataset.actionIndex;
  if (actionIndex !== undefined) {
    const rows = controller?.view().actions.rows ?? [];
    const from = rows.findIndex((row) => row.selected);
    const steps = Number(actionIndex) - Math.max(from, 0);
    for (let step = 0; step < Math.abs(steps); step++)
      sendInput({ type: "move", direction: steps > 0 ? "down" : "up" });
    sendInput({ type: "primary" });
    return;
  }
  const rowId = target.closest<HTMLElement>("#app .rows li[data-id], #app .grid-cell[data-id]")
    ?.dataset.id;
  if (rowId !== undefined) sendInput({ type: "select", id: rowId });
  const menuButton = target.closest<HTMLElement>("[data-menu-id]");
  if (menuButton && controller?.view().menuBar) {
    // A row in a parent level first closes the submenus open beside it.
    const level = Number(menuButton.dataset.menuLevel ?? 0);
    while ((controller?.view().menuBar?.path.length ?? 0) > level)
      sendInput({ type: "move", direction: "left" });
    const items = controller?.view().menuBar?.rows.filter((row) => row.kind !== "section") ?? [];
    const from = items.findIndex((row) => row.selected);
    const to = items.findIndex((row) => row.id === menuButton.dataset.menuId);
    if (to < 0) return;
    for (let step = 0; step < Math.abs(to - from); step++)
      sendInput({ type: "move", direction: to > from ? "down" : "up" });
    sendInput({ type: "primary" });
  }
});
/** The status item opens its command's menu, or closes the open one. */
function toggleMenu() {
  if (!rootOpen && (menuLaunching || controller?.view().kind === "menu-bar")) stopSession();
  else if (menuItem) launchFromLauncher(menuItem.source, menuItem.command, menuItem.row);
}
document.addEventListener("submit", (event) => {
  if (
    !(event.target instanceof HTMLFormElement) ||
    event.target.id !== "preferences-form" ||
    !preferenceForm
  )
    return;
  event.preventDefault();
  const fields =
    preferenceForm.scope === "extension"
      ? preferenceForm.extension
      : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
  const values = preferenceFormValues(event.target, fields);
  const missing = missingPreferences(fields, values);
  if (missing.length) {
    const error = document.querySelector("#preference-error");
    if (error) error.textContent = `Required: ${missing.map((field) => field.title).join(", ")}`;
    return;
  }
  const extensionNames = new Set(preferenceForm.extension.map((field) => field.name));
  const extensionValues: Record<string, string | boolean> = {};
  const commandValues: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(values))
    (extensionNames.has(name) ? extensionValues : commandValues)[name] = value;
  preferenceForm.store.update(extensionValues, preferenceForm.command, commandValues);
  const { source, command } = preferenceForm;
  preferenceFormVisible = false;
  void launch(source, command).catch((error) => setStatus(String(error), true));
});
void start();
