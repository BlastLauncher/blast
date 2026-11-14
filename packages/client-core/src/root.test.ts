import { expect, test } from "bun:test";
import { createRootController, type RootCommand } from "./root.ts";
import { iconView } from "./icons.ts";

const catalog: RootCommand[] = [
  {
    extension: "hello",
    extensionTitle: "Hello",
    command: "hello-list",
    title: "Hello List",
    subtitle: "Greetings",
    mode: "view",
    icon: iconView("add-16"),
  },
  {
    extension: "hello",
    extensionTitle: "Hello",
    command: "quiet",
    title: "Quiet",
    mode: "no-view",
  },
  {
    extension: "notes",
    extensionTitle: "Notes",
    command: "bar",
    title: "Menu Notes",
    description: "From the menu bar",
    mode: "menu-bar",
  },
];
const titles = (view: { rows: { kind: string; title: string }[] }, kind = "item") =>
  view.rows.filter((r) => r.kind === kind).map((r) => r.title);

test("root: one section per extension, items in catalog order, first selected", () => {
  const view = createRootController(catalog).view();
  expect(view.kind).toBe("list");
  expect(titles(view, "section")).toEqual(["Hello", "Notes"]);
  expect(titles(view)).toEqual(["Hello List", "Quiet", "Menu Notes"]);
  expect(view.rows.find((r) => r.kind === "section")?.count).toBe(2);
  expect(view.selectedId).toBe("hello:hello-list");
  expect(view.primary).toEqual({ title: "Open Command", shortcut: "", enabled: true });
  expect(view.rows.filter((r) => r.selected).map((r) => r.id)).toEqual(["hello:hello-list"]);
});

test("root: rows carry subtitle (falling back to description), mode label and icon", () => {
  const rows = createRootController(catalog).view().rows;
  const hello = rows.find((r) => r.id === "hello:hello-list");
  expect(hello).toMatchObject({
    subtitle: "Greetings",
    accessories: "Command",
    icon: true,
    iconSource: { kind: "builtin", name: "add-16" },
    text: "Hello List  Greetings",
  });
  expect(rows.find((r) => r.id === "hello:quiet")).toMatchObject({
    accessories: "No View",
    icon: false,
    text: "Quiet",
  });
  expect(rows.find((r) => r.id === "hello:quiet")).not.toHaveProperty("iconSource");
  expect(rows.find((r) => r.id === "notes:bar")).toMatchObject({
    subtitle: "From the menu bar",
    accessories: "Menu Bar",
  });
});

test("root: search ranks by title, command name, extension and subtitle, keeping sections", () => {
  const root = createRootController(catalog);
  root.input({ type: "search", text: "notes" });
  expect(titles(root.view())).toEqual(["Menu Notes"]);
  root.input({ type: "search", text: "greet" });
  expect(titles(root.view())).toEqual(["Hello List"]);
  root.input({ type: "search", text: "hello" });
  // Extension keyword matches both commands; the title prefix match ranks first.
  expect(titles(root.view())).toEqual(["Hello List", "Quiet"]);
  root.input({ type: "search", text: "qui" });
  expect(root.view().selectedId).toBe("hello:quiet");
  root.input({ type: "search", text: "zzz" });
  const none = root.view();
  expect(none.rows).toEqual([]);
  expect(none.selectedId).toBeNull();
  expect(none.emptyText).toBe("No matching commands");
  expect(none.primary.enabled).toBe(false);
  expect(root.input({ type: "primary" }).effects).toEqual([]);
});

test("root: a better match later in an extension moves up inside its section", () => {
  const root = createRootController([
    { extension: "a", command: "x", title: "Open Calendar" },
    { extension: "a", command: "y", title: "Calendar" },
  ]);
  root.input({ type: "search", text: "calendar" });
  expect(titles(root.view())).toEqual(["Calendar", "Open Calendar"]);
});

test("root: move and select change the selection and stop at the ends", () => {
  const root = createRootController(catalog);
  root.input({ type: "move", direction: "down" });
  expect(root.view().selectedId).toBe("hello:quiet");
  root.input({ type: "move", direction: "down" });
  root.input({ type: "move", direction: "down" });
  expect(root.view().selectedId).toBe("notes:bar");
  root.input({ type: "move", direction: "up" });
  expect(root.view().selectedId).toBe("hello:quiet");
  root.input({ type: "select", id: "notes:bar" });
  expect(root.view().selectedId).toBe("notes:bar");
  root.input({ type: "select", id: "section:hello" });
  root.input({ type: "select", id: "missing" });
  expect(root.view().selectedId).toBe("notes:bar");
  root.input({ type: "move", direction: "left" });
  expect(root.view().selectedId).toBe("notes:bar");
});

test("root: primary emits a launch effect for the selected command", () => {
  const root = createRootController(catalog);
  root.input({ type: "select", id: "notes:bar" });
  expect(root.input({ type: "primary" }).effects).toEqual([
    { type: "launch", extension: "notes", command: "bar" },
  ]);
  root.input({ type: "search", text: "quiet" });
  expect(root.input({ type: "primary" }).effects).toEqual([
    { type: "launch", extension: "hello", command: "quiet" },
  ]);
});

test("root: the actions panel opens on a command row, primary launches and closes it", () => {
  const root = createRootController(catalog);
  root.input({ type: "openActions" });
  const open = root.view();
  expect(open.actions).toMatchObject({
    open: true,
    title: "Hello List",
    selectedIndex: 0,
    rows: [
      { id: "open", kind: "action", title: "Open Command", selected: true },
      { id: "configure", kind: "action", title: "Configure Command", selected: false },
    ],
  });
  root.input({ type: "move", direction: "down" });
  root.input({ type: "move", direction: "up" });
  expect(root.view().selectedId).toBe("hello:hello-list");
  expect(root.input({ type: "primary" }).effects).toEqual([
    { type: "launch", extension: "hello", command: "hello-list" },
  ]);
  expect(root.view().actions).toMatchObject({ open: false, rows: [], selectedIndex: -1 });
  root.input({ type: "openActions" });
  root.input({ type: "back" });
  expect(root.view().actions.open).toBe(false);
});

test("root: Configure Command is an action and a shortcut; neither launches the command", () => {
  const root = createRootController(catalog, { platform: "macOS" });
  root.input({ type: "move", direction: "down" });
  root.input({ type: "openActions" });
  root.input({ type: "move", direction: "down" });
  const open = root.view().actions;
  expect(open.selectedIndex).toBe(1);
  expect(open.rows[1]).toMatchObject({ title: "Configure Command", shortcut: "⇧⌘," });
  expect(root.input({ type: "primary" }).effects).toEqual([
    { type: "configure", extension: "hello", command: "quiet", scope: "command" },
  ]);
  expect(root.view().actions.open).toBe(false);
  expect(root.input({ type: "key", key: { name: ",", meta: true, shift: true } }).effects).toEqual([
    { type: "configure", extension: "hello", command: "quiet" },
  ]);
  expect(root.input({ type: "key", key: { name: "," } }).effects).toEqual([]);
});

test("root: there are no actions without a command", () => {
  const root = createRootController([]);
  root.input({ type: "openActions" });
  const view = root.view();
  expect(view.actions).toMatchObject({ open: false, rows: [] });
  expect(view.emptyText).toBe("No commands");
});

test("root: inputs meaningless in the root list are ignored", () => {
  const root = createRootController(catalog);
  const before = root.view();
  expect(root.input({ type: "key", key: { name: "a" } }).effects).toEqual([]);
  expect(root.input({ type: "openDropdown" }).effects).toEqual([]);
  expect(root.view()).toEqual(before);
});

test("root: a live catalog keeps the selected command and falls back to the first", () => {
  const root = createRootController(catalog);
  const seen: (string | null)[] = [];
  const stop = root.subscribe((view) => seen.push(view.selectedId));
  root.input({ type: "select", id: "hello:quiet" });
  root.setCatalog([{ extension: "new", command: "n", title: "New" }, ...catalog]);
  expect(root.view().selectedId).toBe("hello:quiet");
  root.setCatalog([{ extension: "new", command: "n", title: "New" }]);
  expect(root.view().selectedId).toBe("new:n");
  stop();
  root.setCatalog([]);
  expect(seen).toEqual(["hello:hello-list", "hello:quiet", "hello:quiet", "new:n"]);
});

test("root: fail shows a toast until the next input; reset restores the initial view", () => {
  const root = createRootController(catalog);
  root.input({ type: "search", text: "quiet" });
  root.fail("Could not open", "Missing preferences");
  expect(root.view().feedback.toast).toEqual({
    style: "failure",
    title: "Could not open",
    message: "Missing preferences",
    actions: [],
  });
  root.input({ type: "move", direction: "down" });
  expect(root.view().feedback.toast).toBeNull();
  root.fail("x", "y");
  root.reset();
  const view = root.view();
  expect(view.search.text).toBe("");
  expect(view.feedback.toast).toBeNull();
  expect(view.selectedId).toBe("hello:hello-list");
});
