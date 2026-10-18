import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { MenuBarExtra } from "./index.ts";

// @covers MenuBarExtra partial
// @covers MenuBarExtra.Props partial
// @covers MenuBarExtra.Props.isLoading partial
// @covers MenuBarExtra.Props.title
// @covers MenuBarExtra.Props.tooltip
// @covers MenuBarExtra.Props.icon
// @covers MenuBarExtra.Props.children
// @covers MenuBarExtra.Item
// @covers MenuBarExtra.Item.Props
// @covers MenuBarExtra.Item.Props.title
// @covers MenuBarExtra.Item.Props.subtitle
// @covers MenuBarExtra.Item.Props.icon
// @covers MenuBarExtra.Item.Props.tooltip
// @covers MenuBarExtra.Item.Props.onAction
// @covers MenuBarExtra.Item.Props.shortcut
// @covers MenuBarExtra.Item.Props.alternate
// @covers MenuBarExtra.ActionEvent
// @covers MenuBarExtra.ActionEvent.type
// @covers MenuBarExtra.Section
// @covers MenuBarExtra.Section.Props
// @covers MenuBarExtra.Section.Props.title
// @covers MenuBarExtra.Section.Props.children
// @covers MenuBarExtra.Submenu
// @covers MenuBarExtra.Submenu.Props
// @covers MenuBarExtra.Submenu.Props.title
// @covers MenuBarExtra.Submenu.Props.icon
// @covers MenuBarExtra.Submenu.Props.children
// @covers MenuBarExtra.Separator
// @covers MenuBarExtra.Separator.Props
test("all menu props serialize, alternates are slots, and clicks reach the original callback", () => {
  let scene: SceneSnapshot;
  const warnings: string[] = [];
  const clicks: string[] = [];
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
    onWarning: (warning) => warnings.push(warning),
  });
  root.render(
    h(
      MenuBarExtra,
      { title: "Menu", icon: "menu.png", tooltip: "Menu tip", isLoading: true },
      h(
        MenuBarExtra.Section,
        { title: "Section" },
        h(
          MenuBarExtra.Submenu,
          { title: "Submenu", icon: "sub.png" },
          h(MenuBarExtra.Item, {
            title: "Item",
            subtitle: "Subtitle",
            icon: "item.png",
            tooltip: "Item tip",
            shortcut: { modifiers: ["cmd", "opt"], key: "i" },
            onAction: (event) => clicks.push(event.type),
            alternate: h(MenuBarExtra.Item, {
              title: "Alternate",
              shortcut: { modifiers: [], key: "x" },
              onAction: (event) => clicks.push(`alternate ${event.type}`),
            }),
          }),
          h(MenuBarExtra.Item, { title: "Disabled" }),
        ),
      ),
      h(MenuBarExtra.Separator),
      h(MenuBarExtra.Submenu, { title: "Empty" }),
    ),
  );
  const menu = scene!.root!;
  expect(menu.type).toBe("MenuBarExtra");
  expect(menu.props).toEqual({
    title: "Menu",
    icon: "menu.png",
    tooltip: "Menu tip",
    isLoading: true,
  });
  const section = menu.children[0]!;
  expect(section.type).toBe("MenuBarExtra.Section");
  expect(section.props).toEqual({ title: "Section" });
  const submenu = section.children[0]!;
  expect(submenu.type).toBe("MenuBarExtra.Submenu");
  expect(submenu.props).toEqual({ title: "Submenu", icon: "sub.png" });
  const item = submenu.children[0]!;
  expect(item.props).toMatchObject({
    title: "Item",
    subtitle: "Subtitle",
    icon: "item.png",
    tooltip: "Item tip",
    shortcut: { modifiers: ["cmd"], key: "i" },
  });
  expect(item.props.alternate).toBeUndefined();
  expect(item.children[0]).toMatchObject({ type: "Slot", props: { name: "alternate" } });
  const alternate = item.children[0]!.children[0]!;
  expect(alternate.props.shortcut).toEqual({ modifiers: ["cmd", "opt"], key: "i" });
  for (const type of ["left-click", "right-click"]) {
    root.dispatch(item.id, (item.props.onAction as { $handler: string }).$handler, [{ type }]);
  }
  root.dispatch(alternate.id, (alternate.props.onAction as { $handler: string }).$handler, [
    { type: "left-click" },
  ]);
  expect(clicks).toEqual(["left-click", "right-click", "alternate left-click"]);
  expect(submenu.children[1]!.props.onAction).toBeUndefined();
  expect(menu.children[1]!.type).toBe("MenuBarExtra.Separator");
  expect(menu.children[2]!.children).toEqual([]);
  root.render(h(MenuBarExtra));
  expect(scene!.root!.props.isLoading).toBe(false);
  expect(warnings).toEqual([]);
  root.unmount();
});

test("alternates without a parent shortcut lose their own; platform shortcuts preserve Windows", () => {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  const alternate = h(MenuBarExtra.Item, {
    title: "Alternate",
    shortcut: { modifiers: ["cmd"], key: "x" },
  });
  root.render(
    h(
      MenuBarExtra,
      null,
      h(MenuBarExtra.Item, { title: "No shortcut", alternate }),
      h(MenuBarExtra.Item, {
        title: "Platforms",
        alternate,
        shortcut: {
          macOS: { modifiers: ["cmd", "opt"], key: "i" },
          Windows: { modifiers: ["ctrl"], key: "i" },
        },
      }),
    ),
  );
  const [plain, platforms] = scene!.root!.children;
  expect(plain!.children[0]!.children[0]!.props.shortcut).toBeUndefined();
  expect(platforms!.props.shortcut).toEqual({
    macOS: { modifiers: ["cmd"], key: "i" },
    Windows: { modifiers: ["ctrl"], key: "i" },
  });
  expect(platforms!.children[0]!.children[0]!.props.shortcut).toEqual({
    macOS: { modifiers: ["cmd", "opt"], key: "i" },
    Windows: { modifiers: ["ctrl"], key: "i" },
  });
  root.unmount();
});
