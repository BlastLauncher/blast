import * as esbuild from "esbuild-wasm";
import { activeNode, type ControllerView } from "../../packages/client-core/src/index.ts";
import type { SceneMessage } from "../../packages/protocol/src/index.ts";
import {
  mount,
  prewarm,
  type WebExit,
  type WebFrame,
  type WebMount,
  type WebPreferenceRequest,
  type WebView,
} from "../../packages/web/src/index.ts";
import { render, renderPreferences } from "../../packages/web/src/render.js";
import { mountRoot, updateRoot } from "./root-launcher.tsx";
import type { Root as ReactRoot } from "react-dom/client";
import { missingPreferences, type Preference } from "@blastlauncher/protocol/preference-fields";
import { controlledSearchText, syncAttributes } from "./search-sync.ts";
import {
  catalogCommandTitle,
  executeRootAction,
  rootActionForKey,
  rootActionModel,
  rootModel,
  rootSections,
  validateCatalog,
  type Catalog,
  type RootActionId,
  type RootRow,
} from "./root.ts";
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
import { escapeHtml } from "../../packages/web/src/render.js";
import {
  menuLevels,
  placeMenu,
  placeSubmenu,
  renderMenuBar,
  renderMenuLoading,
  statusItemMarkup,
} from "./menu-bar.ts";

const asset = (path: string) => new URL(path, new URL(".", location.href)).toString();
const app = document.querySelector<HTMLElement>("#app")!;
/** Every session uses these, so the one warmed while the root is idle is the one adopted. */
const sandboxOptions = {
  sandboxUrl:
    ((globalThis as Record<string, unknown>)["__BLAST_SANDBOX__"] as string | undefined) ?? "",
  assetsUrl: asset("./"),
  bundlesUrl: asset("bundles.json"),
  buildUrl: asset("../build.json"),
};
let esbuildReady: Promise<void> | undefined;
/** esbuild-wasm ships inside client.js; the wasm loads only when a command needs bundling. */
const loadEsbuild = async () => {
  await (esbuildReady ??= esbuild.initialize({ wasmURL: asset("esbuild.wasm"), worker: false }));
  return esbuild;
};
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
/** The running command; `sessionId` drops callbacks from one already closed. */
let session: WebMount | undefined;
let sessionId = 0;
/** What the running session launched, and the root row it was opened from. */
let launched: { source: string; command: string; row?: RootRow } | undefined;
let catalog: Catalog;
let rootQuery = "";
let rootSelected = 0;
let rootRows: RootRow[] = [];
let rootRenderer: ReactRoot | undefined;
let recentIds: string[] = [];
/**
 * Recents as the root draws them. A launch records its row at once, but the
 * root shows the new order only once the query changes, so coming back from a
 * command finds every row where it was left.
 */
let shownRecent: { query: string; ids: string[] } | undefined;
/** The root list's offset when a command replaced it; restored when it mounts again. */
let rootScroll = 0;
let rootOpen = true;
let actionOpen = false;
let actionQuery = "";
let actionSelected = 0;
let rootToast = "";
let statusState: DemoStatus = statusForStage("ready");
/** The preferences the session asked for; answering it resumes (or cancels) the launch. */
let preferenceForm:
  | { request: WebPreferenceRequest; answer: (values?: Record<string, string | boolean>) => void }
  | undefined;
let preferenceFormVisible = false;
/** Between a launch and the command's first view: the stage shows and keys are queued. */
let sessionStarting = false;
let earlyInput = "";
/** The controller's search text as of the field's last input or sync (see `controlledSearchText`). */
let searchBaseline = "";
/** An IME composition is open in a text field; its text must not be replaced. */
let composing = false;
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
/** Waiting for the session's next view (see `syncFieldOptions`). */
const viewListeners = new Set<() => void>();
/** The command's view, once it has drawn one and while no preference form covers it. */
const commandView = () => (sessionStarting || preferenceFormVisible ? undefined : session?.view());
const sendInput = (value: Parameters<WebMount["input"]>[0]) =>
  commandView() ? session?.input(value) : undefined;

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
  if (!catalog || preferenceFormVisible) return;
  if (rootOpen) return drawRoot();
  const view = commandView();
  if (view) draw(view);
  else drawStarting();
};
function unmountRoot() {
  if (!rootRenderer) return;
  rootScroll = app.querySelector(".root-options")?.scrollTop ?? 0;
  rootRenderer.unmount();
  rootRenderer = undefined;
}
function replaceApp(markup: string) {
  unmountRoot();
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
    syncAttributes(previous, next);
    next.replaceWith(previous);
  }
}
/** One sweep of the loader line: the `loading` animation in demo.css. */
const LOADER_SECONDS = 1.5;
/** When the current launch began; after two seconds the stage shows how long it has taken. */
let launchStartedAt = 0;
let stageClock: ReturnType<typeof setInterval> | undefined;
const stageElapsed = () => {
  const seconds = Math.floor((performance.now() - launchStartedAt) / 1000);
  return seconds >= 2 ? `${seconds} s` : "";
};
/** Keeps the elapsed hint current; stops itself once the stage is gone. */
function tickStage() {
  const elapsed = app.querySelector(".loading-elapsed");
  if (elapsed) elapsed.textContent = stageElapsed();
  else {
    clearInterval(stageClock);
    stageClock = undefined;
  }
}
const drawStarting = () => {
  unmountRoot();
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
  const failed = statusState.error;
  // The runtime reports ready a moment before its first scene; that is still starting.
  const stageText = statusState.stage === "ready" ? "Starting…" : statusState.text;
  // Same frame as a rendered view; the loader line under the input sweeps until
  // the first scene. Redraws (a new stage, early typing) continue its sweep
  // from where it was rather than restarting it.
  const sweep = -(((performance.now() - launchStartedAt) / 1000) % LOADER_SECONDS);
  app.innerHTML = `<main class="launching" data-kind="list" data-loading="${failed ? "false" : "true"}" aria-busy="${failed ? "false" : "true"}" style="--loader-delay:${sweep.toFixed(2)}s"><header><h1>${failed ? "Command failed" : "Loading command"}</h1><div class="search-line"><div class="breadcrumb"><span class="breadcrumb-icon">${iconMarkup(20)}</span><span>${extensionTitle}</span><span class="breadcrumb-separator">›</span><span>${commandTitle}</span></div><input id="search" data-starting="true" value="${escapeHtml(earlyInput)}" placeholder="Search…" aria-label="Search" readonly></div></header><section class="loading-stage" data-error="${failed ? "true" : "false"}"><span class="loading-icon">${iconMarkup(40)}</span><strong>${commandTitle}</strong><span class="loading-text">${escapeHtml(stageText)}</span>${failed ? "" : `<span class="loading-elapsed">${stageElapsed()}</span>`}</section><footer><span class="footer-context" aria-hidden="true"><span class="footer-icon">${iconMarkup(20)}</span><span class="footer-title">${extensionTitle}</span></span><span id="status" role="status" data-error="${failed ? "true" : "false"}" data-stage="${statusState.stage}">${escapeHtml(statusState.text)}</span><span class="footer-hints"><button type="button" class="footer-key" data-footer="back"><span>Back</span><kbd>Esc</kbd></button></span></footer></main>`;
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
const viewKey = (view: ControllerView) =>
  `${activeNode(lastScene?.root)?.id ?? ""}:${view.kind}:${view.menuBar?.path.join("/") ?? ""}`;
/** The primary button takes focus so Enter confirms, as in the other clients. */
const focusAlert = (view: ControllerView) => {
  const alertButton = document.querySelector<HTMLButtonElement>(
    "[data-alert=confirm], [data-alert=dismiss]",
  );
  if (view.feedback.alert && alertButton && !document.querySelector(".alert :focus"))
    (document.querySelector<HTMLButtonElement>("[data-alert=confirm]") ?? alertButton).focus();
};
const draw = (view: ControllerView) => {
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
  // A controlled `searchText` the extension changed (cleared, reset, rewritten)
  // reaches the field even while it is focused, which replaceApp never does.
  const search = document.querySelector<HTMLInputElement>("#search");
  if (search && (view.kind === "list" || view.kind === "grid")) {
    const text = controlledSearchText({
      field: search.value,
      view: view.search.text,
      baseline: searchBaseline,
      composing,
    });
    if (text !== undefined) {
      search.value = text;
      if (document.activeElement === search) search.setSelectionRange(text.length, text.length);
    }
    if (!composing) searchBaseline = view.search.text;
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
    !rootOpen && ((sessionStarting && menuLaunching) || commandView()?.kind === "menu-bar");
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
  // Keep the Recent order fixed until the query changes, so opening a row
  // does not shift the list the visitor returns to.
  if (shownRecent?.query !== rootQuery) shownRecent = { query: rootQuery, ids: recentIds };
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
    sections: rootSections(allRows, shownRecent.ids),
    actions: actions.actions,
    actionOpen,
    actionQuery,
    actionSelected,
    status: statusState,
    toast: rootToast,
    scrollTop: rootScroll,
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

function drawPreferences() {
  if (!preferenceForm) return;
  const { fields, values, scope } = preferenceForm.request;
  const unavailable = fields
    .filter(
      (field) =>
        ["file", "directory", "appPicker"].includes(field.type) &&
        field.required &&
        field.default === undefined,
    )
    .map((field) => field.name);
  unmountRoot();
  app.innerHTML = renderPreferences(
    fields,
    values,
    scope === "extension" ? "Extension preferences" : "Set up preferences",
    unavailable,
  );
  preferenceFormVisible = true;
  document.querySelector<HTMLInputElement | HTMLSelectElement>("[data-preference]")?.focus();
}
/** The session's `preferenceForm`: show the form; the submit or Back handler answers it. */
function askPreferences(request: WebPreferenceRequest) {
  return new Promise<Record<string, string | boolean> | undefined>((resolve) => {
    preferenceForm?.answer();
    preferenceForm = {
      request,
      answer: (values) => {
        preferenceForm = undefined;
        preferenceFormVisible = false;
        resolve(values);
      },
    };
    sessionStarting = false;
    earlyInput = "";
    drawPreferences();
  });
}

/** Show the loading stage for a command that is starting, from its first frame. */
function restartStage(command?: string) {
  sessionStarting = true;
  earlyInput = "";
  lastScene = undefined;
  drawn = undefined;
  // `launchCommand` starts another command of the same extension in this session.
  if (command && launched && command !== launched.command) {
    launched = { ...launched, command };
    if (extensionContext)
      extensionContext = {
        ...extensionContext,
        commandTitle: catalogCommandTitle(catalog, launched.source, command) ?? command,
      };
  }
  launchStartedAt = performance.now();
  clearInterval(stageClock);
  stageClock = setInterval(tickStage, 250);
}

/** Each session's `render`: the stage until the command's first view, then its views. */
function renderSession(view: WebView, input: WebMount["input"], frame: WebFrame) {
  if ("type" in view) {
    if (view.type === "error") return failSession(view.message);
    if (!sessionStarting) restartStage(view.command);
    return drawStarting();
  }
  lastScene = frame.scene;
  for (const listener of viewListeners) listener();
  if (preferenceFormVisible || rootOpen) return;
  if (view.kind === "menu-bar" && launched?.row && !menuLaunching)
    rememberMenuItem(launched.source, launched.command, launched.row);
  if (sessionStarting) {
    sessionStarting = false;
    flushEarlyInput(view, input, frame.scene);
  }
  draw(view);
}

/** Keys typed on the stage become the search text, unless the extension controls it. */
function flushEarlyInput(view: ControllerView, input: WebMount["input"], scene?: SceneMessage) {
  const pending = earlyInput;
  earlyInput = "";
  const list = activeNode(scene?.root);
  const controlled =
    list?.props.searchText !== undefined || list?.props.onSearchTextChange !== undefined;
  if (!pending || (view.kind !== "list" && view.kind !== "grid") || view.search.text || controlled)
    return;
  const id = sessionId;
  // Once the session has finished with this scene, as if the keys came right after it.
  queueMicrotask(() => {
    if (id !== sessionId || !commandView()) return;
    input({ type: "search", text: pending });
    const latest = commandView();
    if (latest) draw(latest);
    const search = document.querySelector<HTMLInputElement>("#search");
    if (!search || !latest) return;
    // The first draw already focused the field, and a redraw never overwrites
    // a focused field's text, so write the flushed keys in directly.
    search.value = latest.search.text;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  });
}

/** Before the first view the stage stays, now with the error, until Esc or Back; a running view or a menu returns to the root. */
function failSession(message: string) {
  if (!sessionStarting || menuLaunching) return stopSession(message, true);
  closeSession();
  setStatus(message, true);
}

function commandExited(exit: WebExit) {
  if (exit.reason === "quit") return stopSession();
  document.body.dataset.commandExit = "0";
  const toast = exit.view?.feedback.toast;
  const feedbackTitle = exit.view?.feedback.hud?.title || toast?.title;
  stopSession(
    feedbackTitle || `${extensionContext?.commandTitle ?? "Command"} finished`,
    toast?.style === "failure" || statusState.error,
  );
}

function launch(source: string, command: string, row?: RootRow) {
  closeSession();
  const id = sessionId;
  launched = { source, command, ...(row ? { row } : {}) };
  delete document.body.dataset.commandExit;
  rootOpen = false;
  actionOpen = false;
  restartStage();
  extensionContext = row
    ? {
        extensionTitle: row.subtitle,
        commandTitle: row.title,
        icon: row.icon,
        ...(row.iconUrl ? { iconUrl: row.iconUrl } : {}),
      }
    : undefined;
  if (row) writeRecent(row.id);
  // The catalog knows a menu-bar command before its bundle loads, so its menu
  // can open under the status item at once instead of after a launcher frame.
  menuLaunching =
    row !== undefined &&
    catalog.extensions
      .find((entry) => entry.name === row.extension)
      ?.commands.find((entry) => entry.name === command)?.mode === "menu-bar";
  if (menuLaunching && row) rememberMenuItem(source, command, row);
  const commandTitle =
    extensionContext?.commandTitle ?? catalogCommandTitle(catalog, source, command);
  // The session draws the stage in this task, before any fetch.
  session = mount(app, {
    ...sandboxOptions,
    source,
    command,
    ...(commandTitle ? { commandTitle } : {}),
    fixtures: Object.getOwnPropertyDescriptor(globalThis, "__BLAST_FIXTURES__")?.value === true,
    esbuild: loadEsbuild,
    render: (view, input, frame) => {
      if (id === sessionId) renderSession(view, input, frame);
    },
    onStatus: (status) => {
      if (id === sessionId) setStatus(status.text, status.error === true);
    },
    onExit: (exit) => {
      if (id === sessionId) commandExited(exit);
    },
    preferenceForm: (request) => (id === sessionId ? askPreferences(request) : undefined),
  });
}

function warmIdle() {
  if (rootOpen && !session) prewarm(sandboxOptions);
}
/** Warm a sandbox while the root is idle, for the next command to adopt. */
function scheduleWarm() {
  const idle = (
    globalThis as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(warmIdle, { timeout: 1500 });
  else setTimeout(warmIdle, 200);
}

function rememberMenuItem(source: string, command: string, row: RootRow) {
  if (menuItem?.source !== source || menuItem.command !== command)
    menuItem = { source, command, row, title: row.title };
}

/** Close the running session; the caller decides what to draw. */
function closeSession() {
  const active = session;
  session = undefined;
  sessionId++;
  preferenceForm?.answer();
  active?.close();
}

function stopSession(message = "Ready", error = false) {
  closeSession();
  sessionStarting = false;
  menuLaunching = false;
  lastScene = undefined;
  drawn = undefined;
  earlyInput = "";
  rootOpen = true;
  launched = undefined;
  extensionContext = undefined;
  setStatus(message, error);
  drawRoot();
  scheduleWarm();
}

function backFromExtension() {
  const result = sendInput({ type: "back" });
  if (!result) return stopSession();
  const view = commandView();
  if (view && !result.effects.some((effect) => effect.type === "quit")) draw(view);
}

function runSelected() {
  const selected = rootRows[rootSelected];
  if (!selected) return;
  const source =
    selected.url ??
    `https://github.com/raycast/extensions/tree/${catalog.commit}/extensions/${selected.extension}`;
  launch(source, selected.command, selected);
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
    recentIds = readRecent();
    const params = new URLSearchParams(location.search);
    const extension = params.get("ext");
    const command = params.get("cmd");
    if (extension && command) return launch(extension, command);
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
    const view = commandView();
    if (!view || view.feedback.alert || view.dropdown?.open) return;
    if (!sendInput({ type: "key", key: press })?.handled) return;
    event.preventDefault();
    event.stopPropagation();
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
  if (sessionStarting && !rootOpen) {
    const next = applyEarlyKey(earlyInput, event);
    if (next !== undefined) {
      event.preventDefault();
      earlyInput = next;
      drawStarting();
      return;
    }
  }
  const view = rootOpen ? undefined : commandView();
  if (view?.feedback.alert) return alertKey(event);
  if (view?.dropdown?.open) return dropdownKey(event);
  if (view) {
    if (view.kind === "menu-bar") {
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
      : sendInput({ type: "key", key: keyInputFromEvent(event) });
    if (result?.handled) {
      event.preventDefault();
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
      // The root action panel is a cmdk instance. It owns ArrowUp/ArrowDown/
      // Enter and calls preventDefault before its selection/activation hooks;
      // only handle keys here when cmdk did not consume them.
      if (event.defaultPrevented) return;
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
  } else if (view?.kind === "form" && event.key === "Tab") {
    event.preventDefault();
    sendInput({ type: event.shiftKey ? "focusPrev" : "focusNext" });
  } else if (view?.kind === "form" && isSubmitKey(event)) {
    event.preventDefault();
    sendInput({ type: "submit" });
  } else if (view?.kind === "form" && event.key === " ") {
    const field = view.form?.fields.find((candidate) => candidate.focused);
    if (field?.type === "Form.Checkbox") {
      event.preventDefault();
      sendInput({ type: "toggle", id: field.id });
    }
  } else if (
    view &&
    view.kind !== "form" &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    ["n", "p"].includes(event.key.toLowerCase())
  ) {
    // Ctrl+N / Ctrl+P move like ↓/↑ in pushed views too, as in the root.
    event.preventDefault();
    sendInput({ type: "move", direction: event.key.toLowerCase() === "n" ? "down" : "up" });
  } else if (view && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
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
    if (preferenceFormVisible) stopSession();
    else if (view?.actions.open || view?.dropdown?.open) {
      backFromExtension();
    } else if (view?.search.text) {
      sendInput({ type: "search", text: "" });
      // Keep the focused control in sync while the extension sends its next scene.
      const search = document.querySelector<HTMLInputElement>("#search");
      if (search) search.value = "";
    } else backFromExtension();
  }
});

function toggleExtensionActions() {
  const view = commandView();
  if (!view) return;
  sendInput({ type: view.actions.open ? "closeActions" : "openActions" });
  const next = commandView();
  if (next) draw(next);
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
  if (field && commandView()?.form?.focusId !== field) sendInput({ type: "focus", id: field });
});
document.addEventListener("paste", (event) => {
  if (!sessionStarting || rootOpen) return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text) return;
  event.preventDefault();
  earlyInput = applyEarlyPaste(earlyInput, text);
  drawStarting();
});
document.addEventListener("compositionstart", () => (composing = true), true);
document.addEventListener("compositionend", () => (composing = false), true);
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.closest("#preferences-form") && preferenceForm) {
    const { fields } = preferenceForm.request;
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
  } else if (target.id === "search") {
    sendInput({ type: "search", text: target.value });
    const view = commandView();
    if (view) searchBaseline = view.search.text;
  } else if (target.id === "dropdown-search")
    sendInput({ type: "dropdownQuery", text: target.value });
  else if (target.id === "action-search") sendInput({ type: "actionsQuery", text: target.value });
  else if (target.dataset.field && target instanceof HTMLInputElement && target.type === "checkbox")
    sendInput({ type: "toggle", id: target.dataset.field });
  else if (target.dataset.field && !(target instanceof HTMLSelectElement))
    // A select reports through "change"; a setValue would filter a Dropdown's options.
    sendInput({ type: "setValue", id: target.dataset.field, value: target.value });
});
/** Resolve once the session draws its next view, or after `ms`. */
function nextView(ms = 2000) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => done(), ms);
    function done() {
      viewListeners.delete(done);
      clearTimeout(timer);
      resolve();
    }
    viewListeners.add(done);
  });
}
/**
 * Make a Dropdown or TagPicker hold exactly `wanted`. `optionChoose` toggles one
 * option and its onChange builds on the extension's current value, so toggle one
 * at a time and wait for the scene that reflects it before the next.
 */
async function syncFieldOptions(fieldId: string, wanted: Set<string>, multiple: boolean) {
  const active = session;
  if (!active) return;
  sendInput({ type: "focus", id: fieldId });
  for (let step = 0; step < 64; step++) {
    if (session !== active) return;
    const field = commandView()?.form?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    const have = new Set(field.selected.map((option) => option.value));
    // A Dropdown choice replaces its value, so only a missing option needs choosing.
    const index = field.options.findIndex((option) =>
      multiple
        ? wanted.has(option.value) !== have.has(option.value)
        : wanted.has(option.value) && !have.has(option.value),
    );
    if (index < 0) return;
    const changed = nextView();
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
    stopSession();
    return;
  }
  if (target.closest("#preferences-form")) return;
  if (target.closest("[data-dropdown-open]")) {
    sendInput({ type: "openDropdown" });
    const view = commandView();
    if (view) draw(view);
    return;
  }
  const dropdownValue = target.closest<HTMLElement>("[data-dropdown-value]")?.dataset.dropdownValue;
  if (dropdownValue !== undefined) {
    const view = commandView();
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
    const rows = commandView()?.actions.rows ?? [];
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
  if (menuButton && commandView()?.menuBar) {
    // A row in a parent level first closes the submenus open beside it.
    const level = Number(menuButton.dataset.menuLevel ?? 0);
    while ((commandView()?.menuBar?.path.length ?? 0) > level)
      sendInput({ type: "move", direction: "left" });
    const items = commandView()?.menuBar?.rows.filter((row) => row.kind !== "section") ?? [];
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
  if (!rootOpen && (menuLaunching || commandView()?.kind === "menu-bar")) stopSession();
  else if (menuItem) launch(menuItem.source, menuItem.command, menuItem.row);
}
document.addEventListener("submit", (event) => {
  if (
    !(event.target instanceof HTMLFormElement) ||
    event.target.id !== "preferences-form" ||
    !preferenceForm
  )
    return;
  event.preventDefault();
  const { fields } = preferenceForm.request;
  const values = preferenceFormValues(event.target, fields);
  const missing = missingPreferences(fields, values);
  if (missing.length) {
    const error = document.querySelector("#preference-error");
    if (error) error.textContent = `Required: ${missing.map((field) => field.title).join(", ")}`;
    return;
  }
  // The session saves the values and goes on with the launch.
  preferenceForm.answer(values);
});
void start();
