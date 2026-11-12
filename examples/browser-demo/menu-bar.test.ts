import { expect, test } from "bun:test";
import type { ControllerView, MenuRowView } from "../../packages/client-core/src/index.ts";
import type { SceneNode } from "../../packages/protocol/src/index.ts";
import {
  menuLevels,
  placeMenu,
  placeSubmenu,
  renderMenuBar,
  renderMenuLoading,
  statusItemMarkup,
} from "./menu-bar.ts";

const node = (
  id: string,
  type: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ id, type, props, children });
const run = { $handler: "h" };
const menu = node("m", "MenuBarExtra", { title: "Modes" }, [
  node("s1", "MenuBarExtra.Section", { title: "Actions" }, [
    node("more", "MenuBarExtra.Submenu", { title: "More" }, [
      node("nested", "MenuBarExtra.Item", { title: "Nested", onAction: run }),
    ]),
  ]),
  node("s2", "MenuBarExtra.Section", { title: "Direct" }, [
    node("go", "MenuBarExtra.Item", {
      title: "Go",
      onAction: run,
      shortcut: { modifiers: ["cmd"], key: "g" },
    }),
    node("off", "MenuBarExtra.Item", { title: "Off" }),
  ]),
]);
const row = (id: string, title: string, extra: Partial<MenuRowView> = {}): MenuRowView => ({
  id,
  kind: "item",
  title,
  subtitle: "",
  iconLabel: "",
  shortcut: "",
  disabled: false,
  selected: false,
  ...extra,
});
const view = (rows: MenuRowView[], path: string[] = []) =>
  ({
    kind: "menu-bar",
    title: "Modes",
    feedback: { toast: null, hud: { title: "Done" }, alert: null },
    menuBar: { title: "Modes", tooltip: "", loading: false, path, rows, selectedId: null },
  }) as unknown as ControllerView;

test("menu levels rebuild open parents and mark the open submenu", () => {
  const nested = [row("nested", "Nested", { selected: true })];
  const bar = view(nested, ["more"]).menuBar!;
  const levels = menuLevels(menu, bar, "macOS");
  expect(levels).toHaveLength(2);
  expect(levels[1]).toBe(nested);
  expect(levels[0]!.map((item) => [item.id, item.kind, item.selected])).toEqual([
    ["s1", "section", false],
    ["more", "submenu", true],
    ["s2", "section", false],
    ["go", "item", false],
    ["off", "item", false],
  ]);
  expect(levels[0]!.find((item) => item.id === "go")?.shortcut).toBe("⌘G");
  expect(levels[0]!.find((item) => item.id === "off")?.disabled).toBe(true);
});

test("menu markup draws one panel per level with separators, titles and feedback", () => {
  const top = [
    row("s1", "Actions", { kind: "section" }),
    row("more", "More", { kind: "submenu", selected: true }),
    row("s2", "Direct", { kind: "section" }),
    row("go", "Go", { shortcut: "⌘G", iconLabel: "▶" }),
    row("off", "Off", { disabled: true }),
  ];
  const markup = renderMenuBar(view([row("nested", "Nested")], ["more"]), [top, [row("n", "N")]]);
  expect(markup.match(/class="menu-panel"/g)).toHaveLength(2);
  expect(markup).toContain('data-menu-level="1"');
  // A separator between sections, none above the first.
  expect(markup.match(/menu-separator/g)).toHaveLength(1);
  expect(markup).toContain('<div class="menu-section" role="presentation">Direct</div>');
  expect(markup).toContain('aria-haspopup="menu" aria-expanded="true"');
  expect(markup).toContain("<kbd>⌘G</kbd>");
  expect(markup).toContain('class="menu-icon"');
  expect(markup).toMatch(/data-menu-id="off" data-menu-level="0" disabled/);
  expect(markup).toContain('<aside class="hud" role="status">Done</aside>');
  expect(renderMenuLoading("<Modes>")).toContain("&lt;Modes&gt;");
  expect(statusItemMarkup({ title: "Modes", icon: "⌘" })).toContain("Modes");
});

test("the menu hangs under its status item and stays on screen", () => {
  const viewport = { width: 1280, height: 800 };
  const size = { width: 200, height: 260 };
  expect(placeMenu({ left: 1110, right: 1190, top: 14, bottom: 38 }, size, viewport)).toEqual({
    left: 1072,
    top: 44,
    maxHeight: 748,
  });
  expect(placeMenu({ left: 300, right: 380, top: 14, bottom: 38 }, size, viewport).left).toBe(300);
});

test("a submenu opens right, then left, then below its row on narrow screens", () => {
  const rowBox = { left: 1077, right: 1267, top: 83, bottom: 105 };
  const size = { width: 150, height: 40 };
  const viewport = { width: 1280, height: 800 };
  const parent = { left: 400, right: 600, top: 44, bottom: 300 };
  expect(placeSubmenu(parent, rowBox, size, viewport)).toMatchObject({ left: 598, top: 78 });
  const edge = { left: 1072, right: 1272, top: 44, bottom: 300 };
  expect(placeSubmenu(edge, rowBox, size, viewport)).toMatchObject({ left: 924, top: 78 });
  const phone = { width: 390, height: 844 };
  const wide = { width: 300, height: 40 };
  const placed = placeSubmenu({ left: 60, right: 380, top: 40, bottom: 300 }, rowBox, wide, phone);
  expect(placed.top).toBe(rowBox.bottom);
  expect(placed.left).toBeGreaterThanOrEqual(8);
  expect(placed.left + wide.width).toBeLessThanOrEqual(382);
});
