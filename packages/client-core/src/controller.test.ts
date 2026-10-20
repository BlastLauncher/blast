import { expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { createController, type ControllerResult } from "./controller.ts";
import type { Platform } from "./shortcut.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });
const h = (name: string) => ({ $handler: name });
const slot = (name: string, ...children: SceneNode[]) =>
  node("Slot", `slot-${name}`, { name }, children);
const act = (id: string, props: SceneNode["props"] = {}) =>
  node("Action", id, { title: id, onAction: h(`act-${id}`), ...props });
const item = (
  id: string,
  props: SceneNode["props"] = {},
  actions: SceneNode[] = [act(`${id}-open`)],
) =>
  node("List.Item", id, { title: id, ...props }, [
    slot("actions", node("ActionPanel", `${id}-panel`, {}, actions)),
  ]);
let revision = 0;
function scene(list: SceneNode, ...feedback: SceneNode[]): SceneMessage {
  return {
    type: "scene",
    revision: ++revision,
    root: node("Navigation", "nav", { pop: h("pop") }, [
      node("Navigation.Entry", "entry", { active: true }, [list]),
      ...feedback,
    ]),
  };
}
const withNav = (message: SceneMessage, props: SceneNode["props"]): SceneMessage => ({
  ...message,
  root: { ...message.root!, props: { ...message.root!.props, ...props } },
});
const names = (result: ControllerResult) => result.events.map((e) => e.handler);
const list = (props: SceneNode["props"], ...children: SceneNode[]) =>
  node("List", "list", props, children);

const searchScene = (searchText: string) =>
  scene(list({ onSearchTextChange: h("find"), searchText }, item("a")));

const pagedScene = (count: number, hasMore = true) =>
  scene(
    list(
      { pagination: { pageSize: 2, hasMore, onLoadMore: h("more") } },
      ...["a", "b", "c", "d"].slice(0, count).map((id) => item(id)),
    ),
  );

const navScene = (props: SceneNode["props"]) =>
  withNav(scene(list({ onSearchTextChange: h("find") }, item("a"))), props);

function ready(platform: Platform = "Linux", message?: SceneMessage) {
  const controller = createController({ platform });
  controller.scene(
    message ??
      scene(
        list(
          { onSelectionChange: h("sel") },
          item("apple", {}, [act("apple-open", { shortcut: { modifiers: ["cmd"], key: "o" } })]),
          item("banana", { keywords: ["yellow"] }),
          item("cherry"),
        ),
      ),
  );
  return controller;
}

test("view is plain JSON that round-trips, and the first item is selected and reported", () => {
  const controller = createController({ platform: "Linux" });
  expect(controller.view().kind).toBe("empty");
  const result = controller.scene(
    scene(list({ onSelectionChange: h("sel") }, item("apple"), item("banana"))),
  );
  expect(result.events).toEqual([{ node: "list", handler: "sel", args: ["apple"] }]);
  const view = controller.view();
  expect(view.kind).toBe("list");
  expect(view.selectedId).toBe("apple");
  expect(view.rows.map((row) => [row.id, row.selected])).toEqual([
    ["apple", true],
    ["banana", false],
  ]);
  expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  expect(view.primary).toEqual({ title: "apple-open", shortcut: "Enter", enabled: true });
});

test("typing filters, ranks and keeps or resets the selection", () => {
  const controller = ready();
  controller.input({ type: "move", direction: "down" });
  expect(controller.view().selectedId).toBe("banana");
  // The selection survives a filter that still shows it.
  controller.input({ type: "search", text: "an" });
  expect(controller.view().rows.map((row) => row.id)).toEqual(["banana"]);
  expect(controller.view().selectedId).toBe("banana");
  // Keywords count; a filter that drops the selection moves to the first match.
  const result = controller.input({ type: "search", text: "ch" });
  expect(controller.view().selectedId).toBe("cherry");
  expect(names(result)).toEqual(["sel"]);
  controller.input({ type: "search", text: "" });
  expect(controller.view().selectedId).toBe("cherry");
  expect(controller.input({ type: "search", text: "" }).events).toEqual([]);
  expect(controller.view().search.placeholder).toBe("Search…");
});

test("extension-owned search forwards immediately, or throttled through schedule and tick", () => {
  const plain = createController({ platform: "Linux" });
  plain.scene(scene(list({ onSearchTextChange: h("find") }, item("a"), item("b"))));
  const now = plain.input({ type: "search", text: "ab" });
  expect(now.events).toEqual([{ node: "list", handler: "find", args: ["ab"] }]);
  expect(now.effects).toEqual([]);
  // The view owns the filtering, so nothing is hidden client-side.
  expect(plain.view().rows).toHaveLength(2);

  const throttled = createController({ platform: "Linux" });
  throttled.scene(scene(list({ onSearchTextChange: h("find"), throttle: true }, item("a"))));
  const first = throttled.input({ type: "search", text: "x" });
  expect(first.events).toEqual([]);
  expect(first.effects).toEqual([{ type: "schedule", ms: 200, token: expect.any(String) }]);
  const second = throttled.input({ type: "search", text: "xy" });
  const stale = first.effects[0];
  const token = second.effects[0];
  if (stale?.type !== "schedule" || token?.type !== "schedule") throw new Error("no schedule");
  expect(throttled.tick(stale.token).events).toEqual([]);
  expect(throttled.tick(token.token).events).toEqual([
    { node: "list", handler: "find", args: ["xy"] },
  ]);
  expect(throttled.tick(token.token).events).toEqual([]);
});

test("the extension may set searchText, but a stale echo of what was typed is ignored", () => {
  const controller = createController({ platform: "Linux" });
  controller.scene(searchScene("start"));
  expect(controller.view().search.text).toBe("start");
  controller.input({ type: "search", text: "abc" });
  controller.scene(searchScene("ab"));
  expect(controller.view().search.text).toBe("abc");
  controller.scene(searchScene("abc"));
  controller.scene(searchScene("reset"));
  expect(controller.view().search.text).toBe("reset");
});

test("primary runs the selected item's first action; shortcuts match per platform", () => {
  const linux = ready("Linux");
  expect(names(linux.input({ type: "primary" }))).toEqual(["act-apple-open"]);
  expect(names(linux.input({ type: "key", key: { name: "o", ctrl: true } }))).toEqual([
    "act-apple-open",
  ]);
  expect(linux.input({ type: "key", key: { name: "o", meta: true } }).events).toEqual([]);
  const mac = ready("macOS");
  expect(names(mac.input({ type: "key", key: { name: "o", meta: true } }))).toEqual([
    "act-apple-open",
  ]);
  expect(mac.input({ type: "key", key: { name: "o", ctrl: true } }).events).toEqual([]);
  expect(mac.view().primary.shortcut).toBe("↵");
});

test("the action panel filters, opens a submenu with a breadcrumb, runs, and goes back", () => {
  const actions = [
    act("first"),
    node("ActionPanel.Submenu", "more", { title: "More", onOpen: h("opened") }, [
      act("deep", { shortcut: { modifiers: ["ctrl"], key: "d" } }),
      act("other"),
    ]),
    act("last"),
  ];
  const controller = ready("Linux", scene(list({}, item("only", {}, actions))));
  controller.input({ type: "openActions" });
  let panel = controller.view().actions;
  expect(panel.open).toBe(true);
  expect(panel.rows.map((row) => [row.id, row.kind])).toEqual([
    ["first", "action"],
    ["more", "submenu"],
    ["last", "action"],
  ]);
  controller.input({ type: "move", direction: "down" });
  const open = controller.input({ type: "primary" });
  expect(names(open)).toEqual(["opened"]);
  panel = controller.view().actions;
  expect(panel.breadcrumb).toEqual(["More"]);
  expect(panel.title).toBe("More");
  expect(panel.rows.map((row) => row.shortcut)).toEqual(["Ctrl+D", ""]);
  controller.input({ type: "actionsQuery", text: "oth" });
  expect(controller.view().actions.rows.map((row) => row.id)).toEqual(["other"]);
  controller.input({ type: "back" });
  expect(controller.view().actions.breadcrumb).toEqual([]);
  expect(controller.view().actions.rows).toHaveLength(3);
  controller.input({ type: "move", direction: "down" });
  controller.input({ type: "move", direction: "down" });
  controller.input({ type: "move", direction: "down" });
  expect(controller.view().actions.selectedIndex).toBe(2);
  expect(names(controller.input({ type: "primary" }))).toEqual(["act-last"]);
  expect(controller.view().actions.open).toBe(false);
  // A submenu shortcut opens the panel on that level.
  const shortcut = ready(
    "Linux",
    scene(
      list(
        {},
        item("only", {}, [
          node(
            "ActionPanel.Submenu",
            "more",
            { title: "More", shortcut: { modifiers: ["ctrl"], key: "m" } },
            [act("deep")],
          ),
        ]),
      ),
    ),
  );
  shortcut.input({ type: "key", key: { name: "m", ctrl: true } });
  expect(shortcut.view().actions.open).toBe(true);
  expect(shortcut.view().actions.breadcrumb).toEqual(["More"]);
  shortcut.input({ type: "back" });
  shortcut.input({ type: "back" });
  expect(shortcut.view().actions.open).toBe(false);
  // While the panel is open, list navigation and search are inert.
  controller.input({ type: "openActions" });
  controller.input({ type: "search", text: "zzz" });
  expect(controller.view().search.text).toBe("");
  controller.input({ type: "closeActions" });
  expect(controller.view().actions.open).toBe(false);
});

test("the dropdown filters options and choosing one sends onChange", () => {
  const dropdown = node("List.Dropdown", "dd", { value: "all", onChange: h("changed") }, [
    node("List.Dropdown.Item", "d1", { title: "Everything", value: "all" }),
    node("List.Dropdown.Section", "ds", { title: "Kinds" }, [
      node("List.Dropdown.Item", "d2", { title: "Fruit", value: "fruit" }),
      node("List.Dropdown.Item", "d3", { title: "Veg", value: "veg" }),
    ]),
  ]);
  const controller = ready(
    "Linux",
    scene(list({}, slot("searchBarAccessory", dropdown), item("apple"))),
  );
  expect(controller.view().dropdown).toMatchObject({ label: "Everything", open: false });
  controller.input({ type: "openDropdown" });
  expect(controller.view().dropdown?.options.map((o) => o.value)).toEqual(["all", "fruit", "veg"]);
  controller.input({ type: "dropdownQuery", text: "veg" });
  expect(controller.view().dropdown?.options.map((o) => o.value)).toEqual(["veg"]);
  const chosen = controller.input({ type: "chooseDropdown" });
  expect(chosen.events).toEqual([{ node: "dd", handler: "changed", args: ["veg"] }]);
  expect(controller.view().dropdown?.open).toBe(false);
  controller.input({ type: "openDropdown" });
  controller.input({ type: "move", direction: "down" });
  expect(controller.view().dropdown?.selectedIndex).toBe(1);
  controller.input({ type: "back" });
  expect(controller.view().dropdown?.open).toBe(false);
});

test("pagination asks for the next page once per item count", () => {
  const controller = createController({ platform: "Linux" });
  controller.scene(pagedScene(2));
  expect(names(controller.input({ type: "move", direction: "down" }))).toEqual(["more"]);
  expect(controller.input({ type: "move", direction: "up" }).events).toEqual([]);
  expect(controller.input({ type: "move", direction: "down" }).events).toEqual([]);
  // New items re-arm the request, which fires once the last one is reached.
  expect(controller.scene(pagedScene(4)).events).toEqual([]);
  controller.input({ type: "move", direction: "down" });
  expect(names(controller.input({ type: "move", direction: "down" }))).toEqual(["more"]);
  expect(controller.input({ type: "move", direction: "down" }).events).toEqual([]);
  expect(controller.scene(pagedScene(4, false)).events).toEqual([]);
});

test("a HUD is visible until its scheduled tick; a new HUD restarts the window", () => {
  const controller = createController({ platform: "Linux" });
  const result = controller.scene(
    scene(list({}, item("a")), node("HUD", "hud", { title: "Copied" })),
  );
  const timer = result.effects[0];
  expect(timer).toEqual({ type: "schedule", ms: 2500, token: expect.any(String) });
  expect(controller.view().feedback.hud).toEqual({ title: "Copied" });
  // Same HUD in a later scene does not restart the window.
  expect(
    controller.scene(scene(list({}, item("a")), node("HUD", "hud", { title: "Copied" }))).effects,
  ).toEqual([]);
  const next = controller.scene(
    scene(list({}, item("a")), node("HUD", "hud2", { title: "Again" })),
  );
  const second = next.effects[0];
  if (timer?.type !== "schedule" || second?.type !== "schedule") throw new Error("no schedule");
  controller.tick(timer.token);
  expect(controller.view().feedback.hud).toEqual({ title: "Again" });
  controller.tick(second.token);
  expect(controller.view().feedback.hud).toBeNull();
  const short = createController({ platform: "Linux", hudDurationMs: 10 });
  expect(
    short.scene(scene(list({}, item("a")), node("HUD", "hud", { title: "x" }))).effects[0],
  ).toMatchObject({ ms: 10 });
});

test("an alert blocks other input; confirm reports remember first", () => {
  const alert = node(
    "Alert",
    "alert",
    {
      title: "Delete?",
      message: "Sure",
      rememberUserChoice: true,
      rememberChoice: false,
      onRememberUserChoiceChange: h("remember"),
    },
    [
      node("Alert.Action", "yes", { name: "primaryAction", title: "Delete", onAction: h("yes") }),
      node("Alert.Action", "no", { name: "dismissAction", title: "Cancel", onAction: h("no") }),
    ],
  );
  const message = scene(list({}, item("a"), item("b")), alert);
  const controller = ready("Linux", message);
  expect(controller.view().feedback.alert).toMatchObject({
    title: "Delete?",
    rememberUserChoice: true,
    primary: { title: "Delete" },
    dismiss: { title: "Cancel" },
  });
  expect(controller.input({ type: "move", direction: "down" }).events).toEqual([]);
  expect(controller.view().selectedId).toBe("a");
  expect(controller.input({ type: "primary" }).events).toEqual([]);
  expect(names(controller.input({ type: "alert", confirm: true, remember: true }))).toEqual([
    "remember",
    "yes",
  ]);
  expect(names(controller.input({ type: "alert", confirm: false }))).toEqual(["no"]);
  expect(names(controller.input({ type: "back" }))).toEqual(["no"]);
});

test("toast actions run by index and by shortcut", () => {
  const toast = node("Toast", "toast", { style: "failure", title: "Oops", message: "Disk" }, [
    node("Toast.Action", "retry", {
      name: "primaryAction",
      title: "Retry",
      onAction: h("retry"),
      shortcut: { modifiers: ["ctrl"], key: "r" },
    }),
    node("Toast.Action", "copy", { name: "secondaryAction", title: "Copy", onAction: h("copy") }),
  ]);
  const controller = ready("Linux", scene(list({}, item("a")), toast));
  expect(controller.view().feedback.toast).toEqual({
    style: "failure",
    title: "Oops",
    message: "Disk",
    actions: [
      { title: "Retry", shortcut: "Ctrl+R" },
      { title: "Copy", shortcut: "" },
    ],
  });
  expect(names(controller.input({ type: "toastAction", index: 1 }))).toEqual(["copy"]);
  expect(names(controller.input({ type: "key", key: { name: "r", ctrl: true } }))).toEqual([
    "retry",
  ]);
  expect(controller.input({ type: "toastAction", index: 5 }).events).toEqual([]);
});

test("menu-bar navigation: move, open a submenu, activate, back, and leave", () => {
  const menu = node("MenuBarExtra", "menu", { title: "Ready", onSelectionChange: h("sel") }, [
    node("MenuBarExtra.Item", "one", { title: "One", onAction: h("one") }),
    node("MenuBarExtra.Submenu", "sub", { title: "More" }, [
      node("MenuBarExtra.Item", "two", { title: "Two", onAction: h("two") }),
    ]),
  ]);
  const controller = createController({ platform: "Linux" });
  controller.scene(scene(menu));
  expect(controller.view().kind).toBe("menu-bar");
  expect(controller.view().menuBar?.rows.map((r) => [r.id, r.kind, r.selected])).toEqual([
    ["one", "item", true],
    ["sub", "submenu", false],
  ]);
  expect(names(controller.input({ type: "primary" }))).toEqual(["one"]);
  expect(names(controller.input({ type: "move", direction: "down" }))).toEqual(["sel"]);
  controller.input({ type: "move", direction: "right" });
  expect(controller.view().menuBar?.path).toEqual(["sub"]);
  expect(names(controller.input({ type: "primary" }))).toEqual(["two"]);
  controller.input({ type: "move", direction: "left" });
  expect(controller.view().menuBar?.path).toEqual([]);
  // Esc at the top level leaves the menu: pop when the navigation can, quit otherwise.
  expect(names(controller.input({ type: "back" }))).toEqual(["pop"]);
  const bare = createController({ platform: "Linux" });
  bare.scene({ type: "scene", revision: 1, root: menu });
  expect(bare.input({ type: "back" }).effects).toEqual([{ type: "quit" }]);
  expect(bare.view().requests.quit).toBe(true);
  expect(bare.input({ type: "back" }).effects).toEqual([]);
});

test("back pops the navigation stack, or quits when there is nothing to pop", () => {
  const controller = ready();
  expect(names(controller.input({ type: "back" }))).toEqual(["pop"]);
  const root = createController({ platform: "Linux" });
  root.scene({
    type: "scene",
    revision: 1,
    root: node("Navigation", "nav", {}, [
      node("Navigation.Entry", "e", { active: true }, [list({}, item("a"))]),
    ]),
  });
  expect(root.input({ type: "back" }).effects).toEqual([{ type: "quit" }]);
});

test("clearSearchBar, popToRoot and closeMainWindow requests from the scene", () => {
  const controller = createController({ platform: "Linux" });
  controller.scene(navScene({}));
  controller.input({ type: "search", text: "abc" });
  const cleared = controller.scene(navScene({ clearSearchBar: { id: 1 } }));
  expect(cleared.events).toEqual([{ node: "list", handler: "find", args: [""] }]);
  expect(controller.view().search.text).toBe("");
  expect(controller.view().requests.clearSearch).toBe(true);
  // The same request again is not a new one.
  controller.input({ type: "search", text: "def" });
  expect(controller.scene(navScene({ clearSearchBar: { id: 1 } })).events).toEqual([]);
  expect(controller.view().search.text).toBe("def");
  expect(controller.view().requests.clearSearch).toBe(false);
  // popToRoot only clears the search when it asks to.
  controller.scene(navScene({ clearSearchBar: { id: 1 }, popToRoot: { clearSearchBar: false } }));
  expect(controller.view().search.text).toBe("def");
  controller.scene(navScene({ clearSearchBar: { id: 1 }, popToRoot: { clearSearchBar: true } }));
  expect(controller.view().search.text).toBe("");
  const closing = controller.scene(navScene({ closeMainWindow: true }));
  expect(closing.effects).toEqual([{ type: "quit" }]);
});

test("a grid moves in two dimensions and exposes cells as ids", () => {
  const cell = (id: string) => node("Grid.Item", id, { title: id, content: "img" });
  const controller = createController({ platform: "Linux" });
  controller.scene(scene(node("Grid", "grid", { columns: 2 }, [cell("a"), cell("b"), cell("c")])));
  expect(controller.view().kind).toBe("grid");
  controller.input({ type: "move", direction: "right" });
  expect(controller.view().selectedId).toBe("b");
  controller.input({ type: "move", direction: "down" });
  expect(controller.view().selectedId).toBe("c");
  expect(controller.view().grid?.map((row) => row.cells.map((c) => [c.id, c.selected]))).toEqual([
    [
      ["a", false],
      ["b", false],
    ],
    [["c", true]],
  ]);
  controller.input({ type: "select", id: "a" });
  expect(controller.view().selectedId).toBe("a");
});

test("a form exposes its fields and the focused one; detail exposes text", () => {
  const form = node("Form", "form", {}, [
    node("Form.TextField", "name", { title: "Name", defaultValue: "x" }),
    node("Form.Checkbox", "ok", { title: "OK", focused: true }),
  ]);
  const controller = createController({ platform: "Linux" });
  controller.scene(scene(form));
  expect(controller.view().kind).toBe("form");
  expect(controller.view().form).toEqual({
    fields: [
      { id: "name", type: "Form.TextField", title: "Name", value: "x" },
      { id: "ok", type: "Form.Checkbox", title: "OK", value: null },
    ],
    focusId: "ok",
  });
  expect(controller.view().primary.title).toBe("Submit");
  controller.scene(scene(node("Detail", "d", { markdown: "# Hi" })));
  expect(controller.view().kind).toBe("detail");
  expect(controller.view().detail).toBe("# Hi");
  expect(controller.view().form).toBeNull();
});

test("subscribers hear view changes only, and can unsubscribe", () => {
  const controller = ready();
  const seen: string[] = [];
  const stop = controller.subscribe((view) => seen.push(view.selectedId ?? ""));
  controller.input({ type: "move", direction: "down" });
  controller.input({ type: "key", key: { name: "z" } });
  controller.input({ type: "move", direction: "down" });
  expect(seen).toEqual(["banana", "cherry"]);
  stop();
  controller.input({ type: "move", direction: "up" });
  expect(seen).toHaveLength(2);
});
