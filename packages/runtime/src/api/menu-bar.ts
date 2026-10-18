import { cloneElement, createElement, type ReactElement, type ReactNode } from "react";
import { slot } from "./slot.ts";
import type { ImageLike, KeyShortcut, Shortcut } from "./types.ts";

export interface MenuBarActionEvent {
  type: "left-click" | "right-click";
}
export interface MenuBarExtraProps {
  isLoading?: boolean;
  title?: string;
  tooltip?: string;
  icon?: ImageLike;
  children?: ReactNode;
}
export interface MenuBarItemProps {
  title: string;
  subtitle?: string;
  icon?: ImageLike;
  tooltip?: string;
  onAction?: (event: MenuBarActionEvent) => void;
  shortcut?: Shortcut | undefined;
  alternate?: ReactElement<MenuBarItemProps>;
}
export interface MenuBarSectionProps {
  children?: ReactNode;
  title?: string;
}
export interface MenuBarSubmenuProps {
  title: string;
  icon?: ImageLike;
  children?: ReactNode;
}

function modifiers(shortcut: Shortcut | undefined, alternate: boolean): Shortcut | undefined {
  if (!shortcut) return undefined;
  const adjust = (value: KeyShortcut): KeyShortcut => ({
    ...value,
    modifiers: [...value.modifiers.filter((key) => key !== "opt"), ...(alternate ? ["opt"] : [])],
  });
  if ("modifiers" in shortcut) return adjust(shortcut);
  return { ...shortcut, macOS: adjust(shortcut.macOS) };
}

function Item({ alternate, shortcut, ...props }: MenuBarItemProps) {
  // Alternates inherit the parent's shortcut plus Option, never their own.
  const primaryShortcut = alternate ? modifiers(shortcut, false) : shortcut;
  return createElement(
    "MenuBarExtra.Item",
    { ...props, shortcut: primaryShortcut },
    slot(
      "alternate",
      alternate ? cloneElement(alternate, { shortcut: modifiers(shortcut, true) }) : null,
    ),
  );
}
function Section(props: MenuBarSectionProps) {
  return createElement("MenuBarExtra.Section", props);
}
function Submenu(props: MenuBarSubmenuProps) {
  return createElement("MenuBarExtra.Submenu", props);
}
function Separator() {
  return createElement("MenuBarExtra.Separator");
}
export const MenuBarExtra = Object.assign(
  function MenuBarExtra(props: MenuBarExtraProps) {
    return createElement("MenuBarExtra", { ...props, isLoading: props.isLoading ?? false });
  },
  { Item, Section, Submenu, Separator },
);
